import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import net from "node:net";
import type { Duplex } from "node:stream";
import { resolvePublicHost, validatePublicUrl, parsePublicUrl } from "./security.js";

import { CaptureError } from "../lib/errors.js";

const sockets = new Set<net.Socket>();
let receivedBytes = 0;
let exceededBudget = false;
const limitBytes = () => Number(process.env.MAX_PAGE_TRANSFER_BYTES || 100 * 1024 * 1024);
export function assertEgressBudget() {
  if (exceededBudget) throw new CaptureError('RESOURCE_LIMIT', 'Website exceeded the network transfer limit.');
}
function track(socket: net.Socket, incoming = false) {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
  socket.on('error', () => {});
  socket.setTimeout(30_000, () => socket.destroy());
  if (sockets.size > 256) { exceededBudget = true; for (const s of sockets) s.destroy(); }
  if (incoming) socket.on('data', (data: Buffer) => {
    receivedBytes += data.length;
    if (receivedBytes > limitBytes()) { exceededBudget = true; for (const s of sockets) s.destroy(); }
  });
  return socket;
}
let proxyPromise: Promise<{ url: string; close: () => Promise<void> }> | null = null;

function safeHeaders(headers: IncomingMessage["headers"], host: string) {
  const result: Record<string, string | string[] | undefined> = { ...headers, host };
  delete result["proxy-authorization"];
  delete result["proxy-connection"];
  return result;
}

function parseUpgradeTarget(req: IncomingMessage) {
  const raw = req.url || "/";
  if (/^wss?:\/\//i.test(raw)) return new URL(raw.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:"));
  if (/^https?:\/\//i.test(raw)) return new URL(raw);
  const host = req.headers.host;
  if (!host) throw new Error("Missing Host header");
  return new URL(`http://${host}${raw.startsWith("/") ? raw : `/${raw}`}`);
}

function rejectSocket(socket: Duplex, status = "403 Forbidden") {
  if (!socket.destroyed) socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

async function proxyHttpRequest(req: IncomingMessage, res: http.ServerResponse) {
  try {
    if (!req.url) throw new Error("Missing URL");
    const target = new URL(req.url);
    await validatePublicUrl(target.toString());
    const resolved = await resolvePublicHost(target.hostname);
    const port = Number(target.port || (target.protocol === "https:" ? 443 : 80));
    const base = {
      hostname: resolved.address,
      family: resolved.family,
      port,
      method: req.method,
      path: `${target.pathname}${target.search}`,
      headers: safeHeaders(req.headers, target.host),
    };
    const upstream = target.protocol === "https:"
      ? https.request({ ...base, servername: resolved.hostname }, (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode || 502, upstreamRes.statusMessage, upstreamRes.headers);
          upstreamRes.pipe(res);
        })
      : http.request(base, (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode || 502, upstreamRes.statusMessage, upstreamRes.headers);
          upstreamRes.pipe(res);
        });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    upstream.setTimeout(20_000, () => upstream.destroy());
    upstream.on("socket", (socket) => track(socket, true));
    res.once("close", () => upstream.destroy());
    req.pipe(upstream);
  } catch {
    res.writeHead(403, { "content-type": "text/plain", "connection": "close" });
    res.end("Blocked by SiteCapture SSRF policy");
  }
}

async function proxyConnect(req: IncomingMessage, clientSocket: Duplex, head: Buffer) {
  try {
    const target = parsePublicUrl(`https://${req.url}`);
    const resolved = await resolvePublicHost(target.hostname);
    const port = Number(target.port || 443);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port");
    const upstream = track(net.connect({ host: resolved.address, port, family: resolved.family }), true);
    upstream.setTimeout(20_000);
    upstream.once("connect", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\nProxy-Agent: SiteCapture\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.once("timeout", () => upstream.destroy());
    upstream.once("error", () => rejectSocket(clientSocket, "502 Bad Gateway"));
    clientSocket.once("error", () => upstream.destroy());
    clientSocket.once("close", () => upstream.destroy());
    upstream.once("close", () => clientSocket.destroy());
  } catch {
    rejectSocket(clientSocket);
  }
}

async function proxyUpgrade(req: IncomingMessage, clientSocket: Duplex, head: Buffer) {
  try {
    const target = parseUpgradeTarget(req);
    await validatePublicUrl(target.toString());
    const resolved = await resolvePublicHost(target.hostname);
    const port = Number(target.port || 80);
    const upstream = track(net.connect({ host: resolved.address, port, family: resolved.family }), true);
    upstream.setTimeout(20_000);
    upstream.once("connect", () => {
      const headerLines = Object.entries(safeHeaders(req.headers, target.host))
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
        .join("\r\n");
      upstream.write(`${req.method || "GET"} ${target.pathname}${target.search} HTTP/${req.httpVersion}\r\n${headerLines}\r\n\r\n`);
      if (head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.once("timeout", () => upstream.destroy());
    upstream.once("error", () => rejectSocket(clientSocket, "502 Bad Gateway"));
  } catch {
    rejectSocket(clientSocket);
  }
}

export function getEgressProxy() {
  if (!proxyPromise) {
    proxyPromise = new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => { void proxyHttpRequest(req, res); });
      server.on("connect", (req, socket, head) => { void proxyConnect(req, socket, head); });
      server.on("upgrade", (req, socket, head) => { void proxyUpgrade(req, socket, head); });
      server.on("connection", (socket) => track(socket));
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") return reject(new Error("Could not start egress proxy"));
        resolve({
          url: `http://127.0.0.1:${address.port}`,
          close: () => new Promise<void>((done) => { for (const socket of sockets) socket.destroy(); server.close(() => done()); }),
        });
      });
    });
  }
  return proxyPromise;
}

export async function closeEgressProxy() {
  if (!proxyPromise) return;
  try { await (await proxyPromise).close(); } finally { proxyPromise = null; receivedBytes = 0; exceededBudget = false; }
}
