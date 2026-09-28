FROM mcr.microsoft.com/playwright:v1.63.0-noble AS build
WORKDIR /app
COPY worker/package.json worker/package-lock.json ./worker/
RUN cd worker && npm ci --include=dev --no-audit --no-fund
COPY shared ./shared
COPY worker/tsconfig.json ./worker/
COPY worker/src ./worker/src
RUN cd worker && npm run build && npm prune --omit=dev

FROM mcr.microsoft.com/playwright:v1.63.0-noble AS runner
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app/worker
COPY --from=build --chown=pwuser:pwuser /app/worker/package.json ./package.json
COPY --from=build --chown=pwuser:pwuser /app/worker/node_modules ./node_modules
COPY --from=build --chown=pwuser:pwuser /app/worker/dist ./dist
RUN mkdir -p temp && chown pwuser:pwuser temp
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright CHROMIUM_NO_SANDBOX=false
USER pwuser
EXPOSE 8787
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/worker/src/server.js"]
