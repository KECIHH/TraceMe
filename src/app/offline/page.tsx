import type { Metadata } from "next";

import { OfflineFallback } from "@/components/offline-fallback";

export const metadata: Metadata = {
  title: "离线模式 - TraceMe 迹遇",
};

export default function OfflinePage() {
  return <OfflineFallback />;
}
