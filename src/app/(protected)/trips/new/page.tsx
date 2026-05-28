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
          先记录基础信息，后续可以继续补充行程日历、目的地、路线、预算和文件。
        </p>
      </div>

      <div className="rounded-lg border border-[#d8d2c6] bg-white p-5 shadow-sm sm:p-6">
        <TripForm
          action={createTripAction}
          cancelHref="/trips"
          initialState={createTripActionState()}
          submitLabel="创建旅行"
        />
      </div>
    </section>
  );
}
