import type { auth } from "./auth.js";

export interface Variables {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
}
