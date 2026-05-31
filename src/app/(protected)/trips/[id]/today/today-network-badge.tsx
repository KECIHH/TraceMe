"use client";

import { useEffect, useState } from "react";

export function TodayNetworkBadge() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const update = () => setIsOnline(window.navigator.onLine);

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <p
      className={[
        "rounded-full px-3 py-1 text-xs font-semibold",
        isOnline
          ? "bg-[#e8f6ef] text-[#276044]"
          : "bg-[#fff8ec] text-[#7a4b12]",
      ].join(" ")}
      data-testid="today-network-badge"
      role="status"
    >
      {isOnline ? "在线" : "离线：显示已缓存内容"}
    </p>
  );
}
