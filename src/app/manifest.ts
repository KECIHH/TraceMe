import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f6f4ef",
    description: "旅行途中可离线查看今日行程、准备清单和地点摘要。",
    display: "standalone",
    icons: [
      {
        purpose: "maskable",
        sizes: "192x192",
        src: "/icons/traceme-192.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/icons/traceme-512.png",
        type: "image/png",
      },
    ],
    id: "/dashboard",
    lang: "zh-CN",
    name: "TraceMe 迹遇",
    scope: "/",
    short_name: "迹遇",
    start_url: "/dashboard",
    theme_color: "#2f6f73",
  };
}
