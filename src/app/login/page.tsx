import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f4ef] px-4 py-10 text-[#172026]">
      <section className="w-full max-w-sm rounded-lg border border-[#d8d2c6] bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold text-[#2f6f73]">TraceMe</p>
          <h1 className="mt-2 text-2xl font-semibold">登录到迹遇</h1>
          <p className="mt-2 text-sm leading-6 text-[#5d6972]">
            使用初始化管理员账号进入你的旅行规划后台。
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
