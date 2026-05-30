import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { inputClassName, primaryButtonClassName, StatusPill } from "@/components/ui";
import { writeAuditLog } from "@/lib/audit";
import {
  filterPublicChecklistItems,
  filterPublicDocuments,
  filterPublicPlace,
  getShareUnlockCookieName,
  hashShareToken,
  shouldShareLinkBeAccessible,
  verifyShareUnlockCookie,
} from "@/lib/collaboration";
import { formatBudget, formatTripDateRange } from "@/lib/trips";
import { prisma } from "@/lib/prisma";

import { unlockShareAction } from "./actions";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: "TraceMe 旅行分享",
};

type SharePageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ unlock?: string }>;
};

export default async function SharePage({
  params,
  searchParams,
}: SharePageProps) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  const tokenHash = hashShareToken(token);
  const link = await prisma.tripShareLink.findUnique({
    include: {
      trip: {
        include: {
          checklistItems: {
            orderBy: [{ category: "asc" }, { createdAt: "asc" }],
            take: 40,
          },
          destinations: { orderBy: [{ arrivalDate: "asc" }, { name: "asc" }] },
          documents: { orderBy: { createdAt: "desc" } },
          itineraryDays: {
            include: {
              items: {
                include: { place: { select: { name: true, type: true } } },
                orderBy: [
                  { sortOrder: "asc" },
                  { startTime: "asc" },
                  { createdAt: "asc" },
                ],
              },
            },
            orderBy: { date: "asc" },
          },
          places: {
            include: {
              foodDetail: true,
              stayDetail: true,
            },
            orderBy: [{ type: "asc" }, { name: "asc" }],
            take: 80,
          },
        },
      },
    },
    where: { tokenHash },
  });
  const access = shouldShareLinkBeAccessible(link);

  if (!link || (!access.ok && access.reason === "missing")) {
    notFound();
  }

  if (!access.ok) {
    await writeAuditLog({
      action: "trip.share_accessed",
      entityId: link.id,
      entityType: "TripShareLink",
      metadata: { deniedReason: access.reason, tripId: link.tripId },
    });

    return (
      <main
        className="min-h-screen bg-[#f6f4ef] px-4 py-10 text-[#172026]"
        data-testid="share-denied-page"
      >
        <section className="mx-auto max-w-xl rounded-lg border border-[#d8d2c6] bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-[#2f6f73]">TraceMe</p>
          <h1 className="mt-2 text-2xl font-semibold">分享不可访问</h1>
          <p className="mt-3 text-sm leading-6 text-[#5d6972]">
            该分享链接已关闭、撤销或过期。
          </p>
        </section>
      </main>
    );
  }

  const cookieStore = await cookies();
  const passwordUnlocked = verifyShareUnlockCookie({
    cookieValue: cookieStore.get(getShareUnlockCookieName(tokenHash))?.value,
    passwordHash: link.passwordHash,
    tokenHash,
  });

  if (!passwordUnlocked) {
    await writeAuditLog({
      action: "trip.share_accessed",
      entityId: link.id,
      entityType: "TripShareLink",
      metadata: {
        deniedReason:
          query.unlock === "failed" ? "wrong_password" : "missing_password",
        tripId: link.tripId,
      },
    });

    return (
      <main className="min-h-screen bg-[#f6f4ef] px-4 py-10 text-[#172026]">
        <section className="mx-auto max-w-sm rounded-lg border border-[#d8d2c6] bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-[#2f6f73]">TraceMe</p>
          <h1 className="mt-2 text-2xl font-semibold">输入访问密码</h1>
          <form action={unlockShareAction.bind(null, token)} className="mt-5 grid gap-4">
            <label>
              <span className="text-sm font-medium text-[#34434c]">密码</span>
              <input
                className={`${inputClassName} mt-2`}
                name="password"
                required
                type="password"
              />
            </label>
            {query.unlock === "failed" ? (
              <p className="text-sm text-[#9b2f1f]">密码不正确。</p>
            ) : null}
            <SubmitButton className={primaryButtonClassName}>
              查看分享
            </SubmitButton>
          </form>
        </section>
      </main>
    );
  }

  await prisma.tripShareLink.update({
    data: { lastAccessedAt: new Date() },
    where: { id: link.id },
  });
  await writeAuditLog({
    action: "trip.share_accessed",
    entityId: link.id,
    entityType: "TripShareLink",
    metadata: { tripId: link.tripId },
  });

  const trip = link.trip;
  const publicDocuments = filterPublicDocuments(trip.documents);
  const publicChecklistItems = filterPublicChecklistItems(trip.checklistItems);
  const publicPlaces = trip.places.map(filterPublicPlace);
  const stays = publicPlaces.filter((place) => place.stayDetail);
  const foods = publicPlaces.filter((place) => place.foodDetail);

  return (
    <main
      className="min-h-screen bg-[#f6f4ef] px-4 py-8 text-[#172026]"
      data-testid="public-share-page"
    >
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-lg border border-[#d8d2c6] bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-[#2f6f73]">TraceMe 分享</p>
          <h1 className="mt-2 text-3xl font-semibold">{trip.title}</h1>
          {trip.description ? (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6972]">
              {trip.description}
            </p>
          ) : null}
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
            <Info label="日期" value={formatTripDateRange(trip.startDate, trip.endDate)} />
            <Info label="目的地" value={trip.mainDestination ?? "未设置"} />
            <Info label="预算" value={formatBudget(trip.budgetAmount, trip.baseCurrency)} />
          </dl>
          <p className="mt-4 rounded-md border border-[#ead0a7] bg-[#fff8ec] px-4 py-3 text-sm text-[#7a4b12]">
            这是只读分享页，不包含敏感文件、证件、保险、订单号等敏感信息。
          </p>
        </header>

        <Section title="目的地">
          {trip.destinations.length === 0 ? (
            <Empty text="暂无目的地。" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {trip.destinations.map((destination) => (
                <article
                  className="rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm"
                  key={destination.id}
                >
                  <h3 className="font-semibold">{destination.name}</h3>
                  <p className="mt-1 text-sm text-[#5d6972]">
                    {[destination.region, destination.country].filter(Boolean).join(" / ") ||
                      "地区未设置"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </Section>

        <Section title="行程">
          {trip.itineraryDays.length === 0 ? (
            <Empty text="暂无行程。" />
          ) : (
            <div className="space-y-4">
              {trip.itineraryDays.map((day) => (
                <article
                  className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm"
                  key={day.id}
                >
                  <h3 className="font-semibold">
                    {formatDate(day.date)}
                    {day.city ? ` / ${day.city}` : ""}
                  </h3>
                  <div className="mt-3 space-y-2">
                    {day.items.length === 0 ? (
                      <p className="text-sm text-[#5d6972]">暂无安排。</p>
                    ) : (
                      day.items.map((item) => (
                        <div
                          className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-3"
                          key={item.id}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-medium">{item.title}</h4>
                            <StatusPill tone="muted">{item.type}</StatusPill>
                          </div>
                          <p className="mt-1 text-sm text-[#5d6972]">
                            {formatTimeRange(item.startTime, item.endTime)}
                            {item.place ? ` / ${item.place.name}` : ""}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>

        <Section title="住宿与美食">
          <div className="grid gap-4 md:grid-cols-2">
            <SimpleList
              empty="暂无住宿。"
              items={stays.map((place) => ({
                detail: place.address ?? "地址未设置",
                id: place.id,
                title: place.name,
              }))}
              title="住宿"
            />
            <SimpleList
              empty="暂无美食。"
              items={foods.map((place) => ({
                detail: place.address ?? "地址未设置",
                id: place.id,
                title: place.name,
              }))}
              title="美食"
            />
          </div>
        </Section>

        <Section title="准备清单">
          {publicChecklistItems.length === 0 ? (
            <Empty text="暂无清单。" />
          ) : (
            <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
              <ul className="grid gap-2 sm:grid-cols-2">
                {publicChecklistItems.map((item) => (
                  <li className="text-sm" key={item.id}>
                    <span className="font-medium">{item.category}</span> / {item.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="公开文件">
          {publicDocuments.length === 0 ? (
            <Empty text="暂无可公开文件。" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {publicDocuments.map((document) => (
                <article
                  className="rounded-lg border border-[#d8d2c6] bg-white p-4 shadow-sm"
                  key={document.id}
                >
                  <h3 className="font-semibold">{document.title}</h3>
                  <p className="mt-1 text-sm text-[#5d6972]">
                    {document.originalFileName ?? document.type}
                  </p>
                </article>
              ))}
            </div>
          )}
        </Section>
      </section>
    </main>
  );
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#7a858c]">{label}</dt>
      <dd className="mt-1 font-medium text-[#34434c]">{value}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-6 text-sm text-[#5d6972]">
      {text}
    </p>
  );
}

function SimpleList({
  empty,
  items,
  title,
}: {
  empty: string;
  items: Array<{ detail: string; id: string; title: string }>;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[#5d6972]">{empty}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((item) => (
            <div className="rounded-md border border-[#e0d9cc] bg-[#fbfaf7] p-3" key={item.id}>
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-[#5d6972]">{item.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTimeRange(startTime: Date | null, endTime: Date | null): string {
  if (!startTime && !endTime) {
    return "全天";
  }

  if (startTime && endTime) {
    return `${formatTime(startTime)}-${formatTime(endTime)}`;
  }

  return startTime ? `${formatTime(startTime)} 开始` : `${formatTime(endTime)} 结束`;
}

function formatTime(date: Date | null): string {
  if (!date) {
    return "";
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}
