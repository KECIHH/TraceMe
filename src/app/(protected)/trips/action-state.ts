import type { TripFormErrors, TripFormValues } from "@/lib/trips";

export type TripActionState = {
  values: TripFormValues;
  errors: TripFormErrors;
  message?: string;
};

export const EMPTY_TRIP_FORM_VALUES: TripFormValues = {
  title: "",
  description: "",
  status: "INSPIRATION",
  startDate: "",
  endDate: "",
  homeCity: "",
  mainDestination: "",
  baseCurrency: "CNY",
  budgetAmount: "",
  coverImage: "",
};

export function createTripActionState(
  values: TripFormValues = EMPTY_TRIP_FORM_VALUES,
): TripActionState {
  return { values, errors: {} };
}
