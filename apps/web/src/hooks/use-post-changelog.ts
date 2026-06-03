import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";

interface PostChangelogResponse {
  posted: boolean;
  count: number;
}

const postChangelogFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<PostChangelogResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin.changelog.post.$post(),
        "Couldn't post changelog",
      ),
  );

export function usePostChangelog() {
  return useMutation({
    mutationFn: () => postChangelogFn(),
  });
}
