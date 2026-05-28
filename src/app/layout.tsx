import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraceMe",
  description: "个人自用旅行规划网站",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
