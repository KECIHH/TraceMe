import type { Metadata, Viewport } from "next";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const allowIndexing = process.env.ALLOW_SEARCH_INDEXING === "true";

export const metadata: Metadata = {
  applicationName: "TraceMe 迹遇",
  title: "TraceMe 迹遇",
  description: "私有部署的旅行规划网站",
  manifest: "/manifest.webmanifest",
  robots: allowIndexing
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2f6f73",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
