import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

interface PostChangelogResponse {
  posted: boolean;
  count: number;
}

const postChangelogFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<PostChangelogResponse> =>
      fetchApiJson<PostChangelogResponse>({
        errorTitle: "Couldn't post changelog",
        cookie: context.cookie,
        path: "/api/v1/admin/changelog/post",
        method: "POST",
      }),
  );

export function usePostChangelog() {
  return useMutation({
    mutationFn: () => postChangelogFn(),
  });
}
