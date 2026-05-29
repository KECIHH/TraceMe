"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-16 text-[#172026]">
      <section className="mx-auto max-w-xl rounded-lg border border-[#d8d2c6] bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-[#9b2f1f]">错误</p>
        <h1 className="mt-3 text-2xl font-semibold">页面加载失败</h1>
        <p className="mt-3 text-sm leading-6 text-[#5d6972]">
          数据读取或提交过程中出现问题，请稍后重试。若刚刚提交表单，请确认内容是否已保存。
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
            onClick={() => reset()}
            type="button"
          >
            重新加载
          </button>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#cfd7d2] px-4 py-2.5 text-sm font-semibold text-[#34434c] transition hover:border-[#2f6f73] hover:text-[#2f6f73]"
            href="/dashboard"
          >
            返回首页
          </Link>
        </div>
      </section>
    </main>
  );
}
