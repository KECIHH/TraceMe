import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { Notice } from "@/app/(protected)/trips/[id]/module-nav";
import { SubmitButton } from "@/components/submit-button";

import { updateProfileAction } from "../actions";

type ProfilePageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const user = await requireUser();
  const notice = (await searchParams) ?? {};

  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#2f6f73]" href="/settings">
          返回设置中心
        </Link>
        <p className="mt-4 text-sm font-semibold text-[#2f6f73]">Profile</p>
        <h1 className="mt-2 text-3xl font-semibold">个人资料</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          修改站内显示名称。用户名作为登录标识，当前版本暂不支持修改。
        </p>
      </div>

      <Notice error={notice.error} message={notice.message} />

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <form action={updateProfileAction} className="grid gap-5">
          <label>
            <span className="text-sm font-medium text-[#34434c]">用户名</span>
            <input
              className="mt-2 w-full rounded-md border border-[#cfd7d2] bg-[#f6f4ef] px-3 py-2 text-sm text-[#66737b]"
              disabled
              type="text"
              value={user.username}
            />
          </label>

          <label>
            <span className="text-sm font-medium text-[#34434c]">显示名称</span>
            <input
              className="mt-2 w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
              defaultValue={user.displayName ?? ""}
              maxLength={80}
              name="displayName"
              placeholder="例如：TraceMe Admin"
              type="text"
            />
          </label>

          <div>
            <SubmitButton
              className="rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
            >
              保存个人资料
            </SubmitButton>
          </div>
        </form>
      </section>
    </section>
  );
}
