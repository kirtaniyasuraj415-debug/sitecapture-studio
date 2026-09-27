import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SiteCapture Studio",
  description: "Crisp website screenshots and smooth website showcase recordings with real Chromium rendering.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
