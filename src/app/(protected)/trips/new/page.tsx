import Link from "next/link";

import { createTripActionState } from "../action-state";
import { createTripAction } from "../actions";
import { TripForm } from "../trip-form";

export default function NewTripPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-[#2f6f73]">New Trip</p>
        <h1 className="mt-2 text-3xl font-semibold">创建旅行计划</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5d6972]">
          默认使用 AI 生成结构化旅行草稿。确认前不会写入正式数据；确认后可在行程、地点、预算、清单等模块继续编辑。
        </p>
      </div>

      <section className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">AI 生成旅行计划</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5d6972]">
              只需填写目的地、出发城市和日期，AI 会生成 Trip、Destination、Place、Itinerary、Checklist、Budget、Route 和 Note 草稿供你预览。
            </p>
          </div>
          <Link
            className="inline-flex justify-center rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62]"
            href="/trips/ai-plan"
          >
            使用 AI 生成旅行
          </Link>
        </div>
        <p className="mt-4 rounded-md border border-[#f0d39b] bg-[#fff9e8] px-4 py-3 text-sm leading-6 text-[#73530f]">
          AI 内容始终标记为草稿。实时票价、班次、酒店库存、开放时间、预约和政策请以官方渠道为准。
        </p>
      </section>

      <details className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm sm:p-6" open>
        <summary className="cursor-pointer text-lg font-semibold text-[#34434c]">
          手动创建旅行
        </summary>
        <div className="mt-5 border-t border-[#e0d9cc] pt-5">
          <TripForm
            action={createTripAction}
            cancelHref="/trips"
            initialState={createTripActionState()}
            submitLabel="创建旅行"
          />
        </div>
      </details>
    </section>
  );
}
