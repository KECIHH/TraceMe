import Link from "next/link";

const moduleLinks = [
  { href: "", label: "概览" },
  { href: "today", label: "今日模式" },
  { href: "destinations", label: "目的地" },
  { href: "places", label: "地点库" },
  { href: "foods", label: "美食" },
  { href: "stays", label: "住宿" },
  { href: "itinerary", label: "行程日历" },
  { href: "routes", label: "交通方案" },
  { href: "budget", label: "预算" },
  { href: "documents", label: "文件票据" },
  { href: "export", label: "导出" },
  { href: "ai", label: "AI 助手" },
  { href: "notes", label: "笔记" },
  { href: "checklist", label: "准备清单" },
];

export function TripModuleNav({
  active,
  tripId,
  tripTitle,
}: {
  active: string;
  tripId: string;
  tripTitle: string;
}) {
  return (
    <div className="space-y-4">
      <Link
        className="inline-flex min-h-10 items-center text-sm font-medium text-[#2f6f73]"
        href={`/trips/${tripId}`}
      >
        返回 {tripTitle}
      </Link>
      <nav
        aria-label={`${tripTitle} 二级导航`}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      >
        {moduleLinks.map((item) => {
          const href = item.href ? `/trips/${tripId}/${item.href}` : `/trips/${tripId}`;
          const isActive = active === item.href;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={[
                "inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-[#2f6f73] text-white"
                  : item.href === "today"
                    ? "border border-[#2f6f73] bg-[#edf4f1] text-[#2f6f73] hover:bg-white"
                    : "border border-[#cfd7d2] bg-white text-[#34434c] hover:border-[#2f6f73] hover:text-[#2f6f73]",
              ].join(" ")}
              href={href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Notice({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  if (!error && !message) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className={[
        "rounded-md border px-4 py-3 text-sm leading-6",
        error
          ? "border-[#f1b8aa] bg-[#fff2ee] text-[#9b2f1f]"
          : "border-[#b8d8ca] bg-[#f0faf5] text-[#276044]",
      ].join(" ")}
    >
      {error ?? message}
    </div>
  );
}
