"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { ThemeToggle } from "@/components/theme-provider";

const navItems = [
  { href: "/dashboard", label: "首页" },
  { href: "/trips", label: "旅行计划" },
  { href: "/settings", label: "系统设置" },
];

export function AppNav({
  logout,
  userLabel,
}: {
  logout: () => Promise<void>;
  userLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const currentTripId = useMemo(() => {
    const match = /^\/trips\/([^/]+)/.exec(pathname);
    const tripId = match?.[1] ?? null;

    if (!tripId || tripId === "new") {
      return null;
    }

    return tripId;
  }, [pathname]);
  const mobileItems = currentTripId
    ? [
        ...navItems,
        {
          href: `/trips/${currentTripId}/today`,
          label: "今日模式",
        },
      ]
    : navItems;

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          className="min-w-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2f6f73]"
          href="/dashboard"
        >
          <p className="truncate text-lg font-semibold">TraceMe 迹遇</p>
          <p className="truncate text-sm text-[#66737b]">{userLabel}</p>
        </Link>

        <button
          aria-expanded={open}
          aria-label={open ? "收起移动端菜单" : "展开移动端菜单"}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#cfd7d2] px-4 py-2 text-sm font-semibold text-[#34434c] transition hover:border-[#2f6f73] hover:text-[#2f6f73] lg:hidden"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? "收起" : "菜单"}
        </button>

        <nav aria-label="主导航" className="hidden items-center gap-2 lg:flex">
          {navItems.map((item) => (
            <NavLink
              href={item.href}
              key={item.href}
              label={item.label}
              pathname={pathname}
            />
          ))}
          <ThemeToggle />
          <form action={logout}>
            <button
              className="inline-flex min-h-11 items-center rounded-md border border-[#cfd7d2] px-3 py-2 text-sm font-medium text-[#34434c] transition hover:border-[#2f6f73] hover:text-[#2f6f73]"
              type="submit"
            >
              退出登录
            </button>
          </form>
        </nav>
      </div>

      {open ? (
        <nav
          aria-label="移动端主导航"
          className="mt-4 grid gap-2 rounded-lg border border-[#d8d2c6] bg-[#fbfaf7] p-3 shadow-sm lg:hidden"
        >
          {mobileItems.map((item) => (
            <NavLink
              href={item.href}
              key={item.href}
              label={item.label}
              onNavigate={() => setOpen(false)}
              pathname={pathname}
            />
          ))}
          <ThemeToggle />
          <form action={logout}>
            <button
              className="inline-flex min-h-11 w-full items-center rounded-md border border-[#cfd7d2] px-3 py-2 text-sm font-medium text-[#34434c] transition hover:border-[#2f6f73] hover:text-[#2f6f73]"
              type="submit"
            >
              退出登录
            </button>
          </form>
        </nav>
      ) : null}
    </div>
  );
}

function NavLink({
  href,
  label,
  onNavigate,
  pathname,
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
  pathname: string;
}) {
  const isActive =
    href === "/trips"
      ? pathname === href || pathname.startsWith("/trips/")
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={[
        "inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium transition",
        isActive
          ? "bg-[#2f6f73] text-white"
          : "text-[#34434c] hover:bg-[#edf4f1] hover:text-[#2f6f73]",
      ].join(" ")}
      href={href}
      onClick={onNavigate}
    >
      {label}
    </Link>
  );
}
