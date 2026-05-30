import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import {
  dangerButtonClassName,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  StatusPill,
} from "@/components/ui";
import {
  getTripRoleLabel,
  requireTripAccess,
  TRIP_MEMBER_ROLE_OPTIONS,
} from "@/lib/collaboration";
import { formatDisplayDateTime } from "@/lib/display-format";
import { prisma } from "@/lib/prisma";

import {
  addTripMemberAction,
  createShareLinkAction,
  removeTripMemberAction,
  revokeShareLinkAction,
  updateShareLinkAction,
  updateTripMemberAction,
} from "./actions";

type MembersPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    createdToken?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function TripMembersPage({
  params,
  searchParams,
}: MembersPageProps) {
  const { id } = await params;
  const notice = (await searchParams) ?? {};
  await requireTripAccess(id, "manageMembers");

  const trip = await prisma.trip.findUnique({
    include: {
      members: {
        include: {
          invitedBy: { select: { displayName: true, username: true } },
          user: { select: { displayName: true, username: true } },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      shareLinks: {
        include: {
          createdBy: { select: { displayName: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const shareBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "";

  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#2f6f73]" href={`/trips/${id}`}>
          返回旅行
        </Link>
        <p className="mt-4 text-sm font-semibold text-[#2f6f73]">协作</p>
        <h1 className="mt-2 text-3xl font-semibold">成员与分享</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          管理旅行成员角色、敏感文件下载授权，以及只读分享链接。
        </p>
      </div>

      <Notice error={notice.error} message={notice.message} />
      {notice.createdToken ? (
        <section className="rounded-lg border border-[#b8d8c8] bg-[#eef8f2] p-5 text-sm text-[#276044] shadow-sm">
          <h2 className="font-semibold">新分享链接</h2>
          <p className="mt-2">
            完整链接只显示一次：
            <code className="break-all rounded bg-white px-2 py-1 text-[#172026]">
              {`${shareBaseUrl}/share/${notice.createdToken}`}
            </code>
          </p>
        </section>
      ) : null}

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">邀请成员</h2>
        <form
          action={addTripMemberAction.bind(null, trip.id)}
          className="mt-4 grid gap-4 md:grid-cols-[1fr_180px_1fr_auto]"
          data-testid="add-trip-member-form"
        >
          <Field label="用户名" required>
            <input className={inputClassName} name="username" required />
          </Field>
          <Field label="角色" required>
            <select className={inputClassName} name="role" required>
              {TRIP_MEMBER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-3 text-sm font-medium text-[#34434c]">
            <input
              className="size-4 accent-[#2f6f73]"
              name="canDownloadSensitiveDocuments"
              type="checkbox"
            />
            允许下载敏感文件
          </label>
          <div className="flex items-end">
            <SubmitButton className={primaryButtonClassName}>
              添加成员
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">成员列表</h2>
        {trip.members.map((member) => (
          <article
            className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
            key={member.id}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">
                    {member.user.displayName ?? member.user.username}
                  </h3>
                  <StatusPill>{getTripRoleLabel(member.role)}</StatusPill>
                  {member.canDownloadSensitiveDocuments ? (
                    <StatusPill tone="warning">敏感文件授权</StatusPill>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-[#5d6972]">
                  @{member.user.username}
                  {member.invitedBy
                    ? `，由 ${member.invitedBy.displayName ?? member.invitedBy.username} 邀请`
                    : ""}
                </p>
              </div>
              <form
                action={updateTripMemberAction.bind(null, trip.id, member.id)}
                className="grid gap-3 sm:grid-cols-[160px_1fr_auto]"
              >
                <select
                  className={inputClassName}
                  defaultValue={member.role}
                  name="role"
                >
                  {TRIP_MEMBER_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm font-medium text-[#34434c]">
                  <input
                    className="size-4 accent-[#2f6f73]"
                    defaultChecked={member.canDownloadSensitiveDocuments}
                    name="canDownloadSensitiveDocuments"
                    type="checkbox"
                  />
                  敏感文件
                </label>
                <SubmitButton className={secondaryButtonClassName}>
                  更新
                </SubmitButton>
              </form>
            </div>
            <form
              action={removeTripMemberAction.bind(null, trip.id, member.id)}
              className="mt-3"
            >
              <SubmitButton className={dangerButtonClassName}>
                移除成员
              </SubmitButton>
            </form>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">创建只读分享链接</h2>
        <form
          action={createShareLinkAction.bind(null, trip.id)}
          className="mt-4 grid gap-4 md:grid-cols-2"
          data-testid="create-share-link-form"
        >
          <Field label="标签">
            <input className={inputClassName} name="label" />
          </Field>
          <Field label="过期时间">
            <input className={inputClassName} name="expiresAt" type="datetime-local" />
          </Field>
          <Field label="访问密码">
            <input className={inputClassName} name="password" type="password" />
          </Field>
          <label className="flex items-end gap-2 pb-3 text-sm font-medium text-[#34434c]">
            <input className="size-4 accent-[#2f6f73]" name="isEnabled" type="checkbox" />
            创建后立即启用
          </label>
          <div>
            <SubmitButton className={primaryButtonClassName}>
              创建分享链接
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">分享链接</h2>
        {trip.shareLinks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-6 text-sm text-[#5d6972]">
            暂无分享链接。
          </p>
        ) : (
          trip.shareLinks.map((link) => (
            <article
              className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
              key={link.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{link.label ?? "未命名分享"}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusPill
                      tone={link.isEnabled && !link.revokedAt ? "success" : "muted"}
                    >
                      {link.revokedAt
                        ? "已撤销"
                        : link.isEnabled
                          ? "已启用"
                          : "未启用"}
                    </StatusPill>
                    {link.passwordHash ? <StatusPill>需要密码</StatusPill> : null}
                    {link.expiresAt ? (
                      <StatusPill tone={link.expiresAt <= new Date() ? "danger" : "warning"}>
                        {link.expiresAt <= new Date() ? "已过期" : "会过期"}
                      </StatusPill>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-[#5d6972]">
                    创建于 {formatDisplayDateTime(link.createdAt)}
                    {link.expiresAt
                      ? `，过期于 ${formatDisplayDateTime(link.expiresAt)}`
                      : "，不过期"}
                  </p>
                </div>
                <form
                  action={revokeShareLinkAction.bind(null, trip.id, link.id)}
                >
                  <SubmitButton className={dangerButtonClassName}>
                    撤销
                  </SubmitButton>
                </form>
              </div>
              {!link.revokedAt ? (
                <form
                  action={updateShareLinkAction.bind(null, trip.id, link.id)}
                  className="mt-4 grid gap-4 border-t border-[#e0d9cc] pt-4 md:grid-cols-2"
                >
                  <Field label="标签">
                    <input
                      className={inputClassName}
                      defaultValue={link.label ?? ""}
                      name="label"
                    />
                  </Field>
                  <Field label="过期时间">
                    <input
                      className={inputClassName}
                      defaultValue={toDateTimeLocal(link.expiresAt)}
                      name="expiresAt"
                      type="datetime-local"
                    />
                  </Field>
                  <Field label="新密码">
                    <input className={inputClassName} name="password" type="password" />
                  </Field>
                  <label className="flex items-end gap-2 pb-3 text-sm font-medium text-[#34434c]">
                    <input
                      className="size-4 accent-[#2f6f73]"
                      defaultChecked={link.isEnabled}
                      name="isEnabled"
                      type="checkbox"
                    />
                    启用分享
                  </label>
                  <div>
                    <SubmitButton className={secondaryButtonClassName}>
                      更新分享
                    </SubmitButton>
                  </div>
                </form>
              ) : null}
            </article>
          ))
        )}
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

function toDateTimeLocal(date: Date | null): string {
  if (!date) {
    return "";
  }

  return [
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-"),
    [
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
    ].join(":"),
  ].join("T");
}
