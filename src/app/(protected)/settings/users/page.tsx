import { SubmitButton } from "@/components/submit-button";
import { inputClassName, primaryButtonClassName, StatusPill } from "@/components/ui";
import { requireAdmin } from "@/lib/collaboration";
import { formatDisplayDateTime } from "@/lib/display-format";
import { prisma } from "@/lib/prisma";

import { createUserAction } from "./actions";

type UsersPageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  await requireAdmin();
  const notice = (await searchParams) ?? {};
  const users = await prisma.user.findMany({
    include: {
      _count: { select: { tripMemberships: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">用户管理</p>
        <h1 className="mt-2 text-3xl font-semibold">创建协作用户</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          管理员创建用户后，可在旅行成员页把用户邀请为 Owner、Editor 或 Viewer。
        </p>
      </div>

      <Notice error={notice.error} message={notice.message} />

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">新用户</h2>
        <form
          action={createUserAction}
          className="mt-4 grid gap-4 md:grid-cols-2"
          data-testid="create-user-form"
        >
          <Field label="用户名" required>
            <input className={inputClassName} name="username" required />
          </Field>
          <Field label="显示名称">
            <input className={inputClassName} name="displayName" />
          </Field>
          <Field label="初始密码" required>
            <input
              className={inputClassName}
              minLength={12}
              name="password"
              required
              type="password"
            />
          </Field>
          <div className="flex items-end">
            <SubmitButton className={primaryButtonClassName}>
              创建用户
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">用户列表</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#e0d9cc] text-xs text-[#66737b]">
              <tr>
                <th className="py-2 pr-4">用户名</th>
                <th className="py-2 pr-4">显示名称</th>
                <th className="py-2 pr-4">系统角色</th>
                <th className="py-2 pr-4">参与旅行</th>
                <th className="py-2 pr-4">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ece3]">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="py-3 pr-4 font-medium">{user.username}</td>
                  <td className="py-3 pr-4">{user.displayName ?? "-"}</td>
                  <td className="py-3 pr-4">
                    <StatusPill tone={user.role === "ADMIN" ? "success" : "muted"}>
                      {user.role}
                    </StatusPill>
                  </td>
                  <td className="py-3 pr-4">{user._count.tripMemberships}</td>
                  <td className="py-3 pr-4">
                    {formatDisplayDateTime(user.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function Notice({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) {
    return null;
  }

  return (
    <div
      className={[
        "rounded-md border px-4 py-3 text-sm",
        error
          ? "border-[#f1b8aa] bg-[#fff2ee] text-[#9b2f1f]"
          : "border-[#b8d8c8] bg-[#eef8f2] text-[#276044]",
      ].join(" ")}
    >
      {error ?? message}
    </div>
  );
}

function Field({
  children,
  label,
  required,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="text-sm font-medium text-[#34434c]">
        {label}
        {required ? <span className="text-[#9b2f1f]"> *</span> : null}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
