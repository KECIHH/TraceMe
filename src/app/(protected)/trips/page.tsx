export default function TripsPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">Trips</p>
        <h1 className="mt-2 text-3xl font-semibold">旅行计划</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          当前阶段已完成受保护入口，旅行计划列表将在后续阶段接入数据库。
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-[#b8c8c4] bg-white p-6 text-sm text-[#5d6972]">
        暂无旅行计划。
      </div>
    </section>
  );
}
