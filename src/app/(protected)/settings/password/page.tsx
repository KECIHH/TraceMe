import Link from "next/link";

import { Notice } from "@/app/(protected)/trips/[id]/module-nav";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/session";

import { changePasswordAction } from "../actions";

type PasswordPageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function PasswordPage({ searchParams }: PasswordPageProps) {
  await requireUser();
  const notice = (await searchParams) ?? {};

  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#2f6f73]" href="/settings">
          返回设置中心
        </Link>
        <p className="mt-4 text-sm font-semibold text-[#2f6f73]">Password</p>
        <h1 className="mt-2 text-3xl font-semibold">修改密码</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          新密码至少 10 位，建议同时包含字母和数字。修改成功后当前会话保持有效，其他会话会失效。
        </p>
      </div>

      <Notice error={notice.error} message={notice.message} />

      <section className="rounded-lg border border-[#ead0a7] bg-[#fff8ec] p-5 text-sm leading-6 text-[#70430f]">
        <h2 className="text-base font-semibold">安全提示</h2>
        <p className="mt-2">
          页面不会显示或返回 passwordHash，也不会记录你输入的密码。错误提示会保持简洁，避免泄露过多验证细节。
        </p>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <form action={changePasswordAction} className="grid gap-5">
          <label>
            <span className="text-sm font-medium text-[#34434c]">当前密码</span>
            <input
              autoComplete="current-password"
              className="mt-2 w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
              name="currentPassword"
              required
              type="password"
            />
          </label>

          <label>
            <span className="text-sm font-medium text-[#34434c]">新密码</span>
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
              minLength={10}
              name="newPassword"
              required
              type="password"
            />
          </label>

          <label>
            <span className="text-sm font-medium text-[#34434c]">确认新密码</span>
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
              minLength={10}
              name="confirmPassword"
              required
              type="password"
            />
          </label>

          <div className="rounded-lg border border-[#f1b8aa] bg-[#fff2ee] p-4 text-sm leading-6 text-[#9b2f1f]">
            修改密码是安全敏感操作。请确认新密码已妥善保存，旧密码会立即失效。
          </div>

          <div>
            <SubmitButton
              className="rounded-md bg-[#9b2f1f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#812717]"
              pendingLabel="更新中..."
            >
              更新密码
            </SubmitButton>
          </div>
        </form>
      </section>
    </section>
  );
}
