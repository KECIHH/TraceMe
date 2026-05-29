import type { Metadata } from "next";
import "./globals.css";

const allowIndexing = process.env.ALLOW_SEARCH_INDEXING === "true";

export const metadata: Metadata = {
  title: "TraceMe 迹遇",
  description: "私有部署的旅行规划网站",
  robots: allowIndexing
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  );
}
