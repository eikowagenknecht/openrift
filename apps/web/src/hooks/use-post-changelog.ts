import { adminChangelogContract } from "@openrift/shared/contracts/admin/changelog";
import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

interface PostChangelogResponse {
  posted: boolean;
  count: number;
}

const postChangelogFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<PostChangelogResponse> =>
    apiOrpcClient(adminChangelogContract, context.cookie).post(),
  );

export function usePostChangelog() {
  return useMutation({
    mutationFn: () => postChangelogFn(),
  });
}
