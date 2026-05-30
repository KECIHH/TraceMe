import Link from "next/link";

import { Notice } from "@/app/(protected)/trips/[id]/module-nav";
import { SubmitButton } from "@/components/submit-button";
import {
  getCurrentSessionTokenHash,
  requireUser,
} from "@/lib/auth/session";
import { formatDisplayDateTime } from "@/lib/display-format";
import { prisma } from "@/lib/prisma";

import { revokeOtherSessionsAction } from "./actions";

type SessionsPageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const user = await requireUser();
  const currentHash = await getCurrentSessionTokenHash();
  const notice = (await searchParams) ?? {};
  const sessions = await prisma.session.findMany({
    orderBy: { createdAt: "desc" },
    where: { userId: user.id },
  });

  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#2f6f73]" href="/settings">
          返回设置中心
        </Link>
        <p className="mt-4 text-sm font-semibold text-[#2f6f73]">Sessions</p>
        <h1 className="mt-2 text-3xl font-semibold">登录会话</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          查看当前账号的有效会话。页面只展示截断后的设备信息，不展示 session token。
        </p>
      </div>

      <Notice error={notice.error} message={notice.message} />

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">有效会话</h2>
          <form action={revokeOtherSessionsAction}>
            <SubmitButton
              className="rounded-md border border-[#9b2f1f] px-4 py-2.5 text-sm font-semibold text-[#9b2f1f] transition hover:bg-[#fff2ee]"
              pendingLabel="处理中..."
            >
              退出其他会话
            </SubmitButton>
          </form>
        </div>

        <div className="mt-4 divide-y divide-[#ece7dc]">
          {sessions.map((session) => {
            const isCurrent = currentHash === session.sessionTokenHash;

            return (
              <article className="py-4" key={session.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">
                    {isCurrent ? "当前会话" : "其他会话"}
                  </h3>
                  {isCurrent ? (
                    <span className="rounded-full bg-[#edf4f2] px-2.5 py-1 text-xs font-semibold text-[#2f6f73]">
                      当前
                    </span>
                  ) : null}
                </div>
                <dl className="mt-2 grid gap-2 text-sm text-[#5d6972] sm:grid-cols-3">
                  <Info label="创建时间" value={formatDisplayDateTime(session.createdAt)} />
                  <Info label="过期时间" value={formatDisplayDateTime(session.expiresAt)} />
                  <Info label="设备信息" value={session.userAgent ?? "未记录"} />
                </dl>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#7a858c]">{label}</dt>
      <dd className="mt-1 break-words font-medium text-[#34434c]">{value}</dd>
    </div>
  );
}
