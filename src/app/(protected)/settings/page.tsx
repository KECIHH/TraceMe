import { requireUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold">系统设置</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          当前只展示只读信息，敏感配置不会在前端显示或修改。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-[#d8d2c6] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">当前用户</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">用户名</dt>
              <dd className="font-medium">{user.username}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">显示名称</dt>
              <dd className="font-medium">{user.displayName ?? "未设置"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">角色</dt>
              <dd className="font-medium">{user.role}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-[#d8d2c6] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">系统信息</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">数据库</dt>
              <dd className="font-medium">SQLite + Prisma</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">认证方式</dt>
              <dd className="font-medium">HTTP-only Cookie Session</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#66737b]">敏感配置</dt>
              <dd className="font-medium">仅服务端读取</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
