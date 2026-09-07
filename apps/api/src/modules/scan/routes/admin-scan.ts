import { adminScanContract } from "@openrift/shared/contracts/admin/scan";
import { createLogger } from "@openrift/shared/logger";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { runJobAsync } from "../../system/services/run-job.js";
import { REBUILD_SCAN_BANK_KIND, rebuildScanBank } from "../services/scan-bank.js";

const log = createLogger("admin");

const os = implement(adminScanContract).$context<ApiContext>().use(requireAuthedUser);

export const adminScanRouter = {
  rebuildBank: os.rebuildBank.handler(async ({ context }) => {
    const { repos, config, io } = context;

    return await runJobAsync(
      { repos, log },
      REBUILD_SCAN_BANK_KIND,
      "admin",
      () =>
        rebuildScanBank({
          repos,
          io,
          log,
          encoderFile: config.scan.encoderFile,
        }),
      { summarize: (result) => result },
    );
  }),
};
