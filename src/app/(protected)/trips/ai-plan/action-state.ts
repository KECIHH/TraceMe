import type { AiPlanInput } from "@/lib/ai-plan";
import { defaultAiPlanInput } from "@/lib/ai-plan";

export type AiPlanActionState = {
  errors: Partial<Record<keyof AiPlanInput | "sensitive", string>>;
  message?: string;
  values: AiPlanInput;
};

export function createAiPlanActionState(
  values: AiPlanInput = defaultAiPlanInput,
): AiPlanActionState {
  return {
    errors: {},
    values,
  };
}
