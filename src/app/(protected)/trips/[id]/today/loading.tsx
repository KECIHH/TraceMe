export default function TodayLoading() {
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-[#2f6f73]">今日执行</p>
        <div className="mt-4 h-8 w-2/3 animate-pulse rounded bg-[#edf1ef]" />
        <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-[#edf1ef]" />
      </div>
      <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm">
        <div className="h-24 animate-pulse rounded bg-[#edf1ef]" />
      </div>
    </section>
  );
}
