"use client";

import Link from "next/link";

import { secondaryButtonClassName } from "@/components/ui";

export default function TodayError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto max-w-2xl rounded-lg border border-[#f1b8aa] bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold text-[#9b2f1f]">今日执行暂不可用</p>
      <h1 className="mt-2 text-2xl font-semibold">加载今日行程时出了问题</h1>
      <p className="mt-3 text-sm leading-6 text-[#5d6972]">
        可以重试，或先回到行程日历查看原计划。
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button className={secondaryButtonClassName} onClick={reset} type="button">
          重试
        </button>
        <Link className={secondaryButtonClassName} href="/trips">
          回到旅行列表
        </Link>
      </div>
    </section>
  );
}
