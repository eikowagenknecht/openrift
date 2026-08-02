import { cardSubmissionsContract } from "@openrift/shared/contracts/card-submissions";
import type { CardSubmissionInput } from "@openrift/shared/contracts/card-submissions";
import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const submitCardFn = createServerFn({ method: "POST" })
  .validator((input: CardSubmissionInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(cardSubmissionsContract, context.cookie).submit(data);
  });

/**
 * Submits an in-app card contribution (ADR-036). The endpoint stages it as a
 * `usersubmission` candidate for admin review. On the daily-cap or validation
 * paths the thrown error's message is contributor-facing and can be shown
 * directly.
 * @returns A React Query mutation; call `.mutate(payload)`.
 */
export function useSubmitCard() {
  return useMutation({
    mutationFn: async (input: CardSubmissionInput) => {
      await submitCardFn({ data: input });
    },
  });
}
