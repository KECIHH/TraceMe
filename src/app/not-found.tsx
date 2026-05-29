import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-16 text-[#172026]">
      <section className="mx-auto max-w-xl rounded-lg border border-[#d8d2c6] bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-[#2f6f73]">404</p>
        <h1 className="mt-3 text-2xl font-semibold">页面或数据不存在</h1>
        <p className="mt-3 text-sm leading-6 text-[#5d6972]">
          可能是链接已失效、数据已被删除，或你没有权限查看这项内容。
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
          href="/dashboard"
        >
          返回首页
        </Link>
      </section>
    </main>
  );
}
