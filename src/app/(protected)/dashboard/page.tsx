export default function DashboardPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold">欢迎回到迹遇</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          这里会成为你的旅行规划工作台，集中管理行程、地点、预算、资料和灵感。
        </p>
      </div>

      <div className="rounded-lg border border-[#d8d2c6] bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">即将开发旅行计划功能</h2>
        <p className="mt-3 text-sm leading-6 text-[#5d6972]">
          下一阶段可以继续完善旅行列表、行程日历、地点库和交通方案比较。
        </p>
      </div>
    </section>
  );
}
