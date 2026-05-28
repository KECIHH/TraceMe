import Link from "next/link";

const moduleLinks = [
  { href: "", label: "概览" },
  { href: "destinations", label: "目的地" },
  { href: "places", label: "地点库" },
  { href: "foods", label: "美食" },
  { href: "stays", label: "住宿" },
  { href: "itinerary", label: "行程日历" },
  { href: "today", label: "今日模式" },
  { href: "routes", label: "交通方案" },
  { href: "budget", label: "预算" },
  { href: "documents", label: "文件票据" },
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
      <Link className="text-sm font-medium text-[#2f6f73]" href={`/trips/${tripId}`}>
        返回 {tripTitle}
      </Link>
      <nav className="flex gap-2 overflow-x-auto pb-1">
        {moduleLinks.map((item) => {
          const href = item.href ? `/trips/${tripId}/${item.href}` : `/trips/${tripId}`;
          const isActive = active === item.href;

          return (
            <Link
              className={[
                "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-[#2f6f73] text-white"
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
    <p
      className={[
        "rounded-md border px-4 py-3 text-sm",
        error
          ? "border-[#f1b8aa] bg-[#fff2ee] text-[#9b2f1f]"
          : "border-[#b8d8ca] bg-[#f0faf5] text-[#276044]",
      ].join(" ")}
    >
      {error ?? message}
    </p>
  );
}
