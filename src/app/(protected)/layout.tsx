import Link from "next/link";

import { logoutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";

const navItems = [
  { href: "/dashboard", label: "首页" },
  { href: "/trips", label: "旅行计划" },
  { href: "/settings", label: "系统设置" },
];

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#172026]">
      <header className="border-b border-[#d8d2c6] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-lg font-semibold">TraceMe 迹遇</p>
            <p className="text-sm text-[#66737b]">
              {user.displayName ?? user.username}
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => (
              <Link
                className="rounded-md px-3 py-2 text-sm font-medium text-[#34434c] transition hover:bg-[#edf4f1] hover:text-[#2f6f73]"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
            <form action={logoutAction}>
              <button
                className="rounded-md border border-[#cfd7d2] px-3 py-2 text-sm font-medium text-[#34434c] transition hover:border-[#2f6f73] hover:text-[#2f6f73]"
                type="submit"
              >
                退出登录
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
