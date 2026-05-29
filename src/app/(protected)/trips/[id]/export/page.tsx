import Link from "next/link";
import { notFound } from "next/navigation";

import { TRIP_EXPORT_INCLUDE } from "@/lib/export/trip";
import { prisma } from "@/lib/prisma";

import { TripModuleNav } from "../module-nav";

type TripExportPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TripExportPage({ params }: TripExportPageProps) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    include: TRIP_EXPORT_INCLUDE,
    where: { id },
  });

  if (!trip) {
    notFound();
  }

  const exportBase = `/api/trips/${trip.id}/export`;

  return (
    <section className="space-y-6">
      <TripModuleNav active="export" tripId={trip.id} tripTitle={trip.title} />

      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">Export</p>
        <h1 className="mt-2 text-3xl font-semibold">导出旅行数据</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          为「{trip.title}」生成 JSON、Markdown 或可打印 HTML。文件导出后会保存在你的浏览器下载目录。
        </p>
      </div>

      <PrivacyNotice />

      <div className="grid gap-4 md:grid-cols-3">
        <ExportCard
          description="包含 Trip、目的地、地点、每日行程、交通、清单、花销、文件元数据、笔记、住宿和美食详情。"
          href={`${exportBase}?format=json`}
          label="导出 JSON"
          title="完整数据 JSON"
        />
        <ExportCard
          description="适合复制到笔记软件或长期归档，按标题、日期、每日行程、交通、住宿、美食、预算和笔记组织。"
          href={`${exportBase}?format=markdown`}
          label="导出 Markdown"
          title="行程 Markdown"
        />
        <ExportCard
          description="在浏览器中打开可打印页面，可直接使用打印按钮另存为 PDF。"
          href={`${exportBase}?format=html`}
          label="打开可打印 HTML"
          target="_blank"
          title="可打印 HTML"
        />
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">导出内容预览</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="目的地" value={`${trip.destinations.length} 条`} />
          <Info label="地点" value={`${trip.places.length} 条`} />
          <Info label="每日行程" value={`${trip.itineraryDays.length} 天`} />
          <Info label="交通方案" value={`${trip.routePlans.length + trip.transports.length} 条`} />
          <Info label="准备清单" value={`${trip.checklistItems.length} 条`} />
          <Info label="预算花销" value={`${trip.expenses.length} 条`} />
          <Info label="文件元数据" value={`${trip.documents.length} 条`} />
          <Info label="笔记" value={`${trip.notes.length} 条`} />
        </dl>
      </section>
    </section>
  );
}

function ExportCard({
  description,
  href,
  label,
  target,
  title,
}: {
  description: string;
  href: string;
  label: string;
  target?: "_blank";
  title: string;
}) {
  return (
    <article className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-3 min-h-24 text-sm leading-6 text-[#5d6972]">{description}</p>
      <Link
        className="mt-4 inline-flex justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
        href={href}
        target={target}
      >
        {label}
      </Link>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#fbfaf7] px-4 py-3">
      <dt className="text-xs text-[#66737b]">{label}</dt>
      <dd className="mt-1 font-semibold text-[#172026]">{value}</dd>
    </div>
  );
}

function PrivacyNotice() {
  return (
    <section className="rounded-lg border border-[#ead0a7] bg-[#fff8ec] p-5 text-sm leading-6 text-[#70430f]">
      <h2 className="text-base font-semibold">隐私提醒</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <li>导出文件可能包含旅行行程、住宿地址、票据记录、预算等隐私信息。</li>
        <li>备份文件请勿上传到不可信网盘或公开分享。</li>
        <li>如包含敏感文件，请考虑加密保存。</li>
        <li>不要把备份文件发给 AI。</li>
      </ul>
    </section>
  );
}
