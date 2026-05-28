const planningItems = [
  "行程草案",
  "证件备忘",
  "预算记录",
  "资料归档",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f4ed] text-[#1f2933]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-12 px-6 py-12 sm:px-10 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-8">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#2f6f73]">
                TraceMe
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-[#172026] sm:text-5xl">
                个人自用旅行规划网站
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#52616b] sm:text-lg">
                用来整理未来行程、预算、文件和旅行灵感。当前阶段已经完成基础工程框架，可以继续扩展真实的行程和资料管理功能。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {planningItems.map((item) => (
                <span
                  className="rounded-md border border-[#c8d5d0] bg-white px-4 py-2 text-sm font-medium text-[#28464b]"
                  key={item}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div
            aria-label="旅行规划状态预览"
            className="relative overflow-hidden rounded-lg border border-[#d7d0c2] bg-white shadow-sm"
          >
            <div className="h-44 bg-[linear-gradient(135deg,#2f6f73_0%,#d99748_52%,#f2d7a0_100%)]" />
            <div className="space-y-5 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-[#66737b]">下一段旅程</p>
                  <p className="mt-1 text-2xl font-semibold text-[#172026]">
                    待规划
                  </p>
                </div>
                <div className="rounded-md bg-[#e7f0ec] px-3 py-2 text-sm font-medium text-[#2f6f73]">
                  本地运行
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  ["0", "行程"],
                  ["0", "文件"],
                  ["0", "备份"],
                ].map(([value, label]) => (
                  <div className="rounded-md bg-[#f7f4ed] p-4" key={label}>
                    <p className="text-2xl font-semibold text-[#172026]">
                      {value}
                    </p>
                    <p className="mt-1 text-xs font-medium text-[#66737b]">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
