import type { ScanManifest } from "@openrift/shared/contracts/scan";
import { scanContract } from "@openrift/shared/contracts/scan";
import { implement } from "@orpc/server";

import { requireUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { bankFileName, labelsFileName } from "../services/scan-bank.js";

const os = implement(scanContract).$context<ApiContext>().use(requireUser);

export const scanRouter = {
  manifest: os.manifest.handler(async ({ context }): Promise<ScanManifest> => {
    const { scanIndex } = context.repos;
    const { scan } = context.config;
    const current = await scanIndex.get();
    return {
      available: current !== null,
      formatVersion: current?.formatVersion ?? null,
      bankHash: current?.bankHash ?? null,
      entryCount: current?.entryCount ?? null,
      builtAt: current?.builtAt.toISOString() ?? null,
      bankUrl: current ? `/media/scan/${bankFileName(current.bankHash)}` : null,
      labelsUrl: current ? `/media/scan/${labelsFileName(current.bankHash)}` : null,
      encoderUrl: `/media/scan/${current?.encoderTag ?? scan.encoderFile}`,
      opencvUrl: `/media/scan/${scan.opencvFile}`,
    };
  }),
};
