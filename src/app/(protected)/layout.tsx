import { logoutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";

import { AppNav } from "./app-nav";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-[#172026]">
      <header className="border-b border-[#d8d2c6] bg-white">
        <AppNav
          logout={logoutAction}
          userLabel={user.displayName ?? user.username}
        />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
