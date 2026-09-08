import { adminPrintingDeskContract } from "@openrift/shared/contracts/admin/printing-desk";
import { implement } from "@orpc/server";

import { assertFound } from "../../../lib/assertions.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { recordAdminEvent } from "../../system/services/record-admin-event.js";
import { toDeskImages, toDeskPrintingRow } from "../lib/printing-desk-presenters.js";
import {
  assertDeskImageFileScope,
  assertDeskPrintingScope,
  createDeskPrinting,
  imagesDeletableBy,
  updateDeskPrinting,
} from "../services/printing-desk.js";

const os = implement(adminPrintingDeskContract).$context<ApiContext>().use(requireAuthedUser);

export const adminPrintingDeskRouter = {
  list: os.list.handler(async ({ input, context }) => {
    const { adminEvents, printingDesk } = context.repos;
    const mine = new Set(await adminEvents.printingIdsCreatedBy(context.userId));

    const rows =
      input.mode === "mine"
        ? await printingDesk.listDeskPrintings({ printingIds: [...mine] })
        : await printingDesk.listDeskPrintings({ promosOnly: true });

    const isAdmin = context.adminAccess?.isAdmin ?? false;
    return {
      printings: rows.map((row) =>
        toDeskPrintingRow(row, { createdByMe: mine.has(row.printingId), isAdmin }),
      ),
    };
  }),

  cardPrintings: os.cardPrintings.handler(async ({ input, context }) => {
    const { adminEvents, printingDesk } = context.repos;
    const card = await printingDesk.getDeskCardBySlug(input.cardSlug);
    assertFound(card, "Card not found");

    const mine = new Set(await adminEvents.printingIdsCreatedBy(context.userId));
    const rows = await printingDesk.listDeskPrintingsForCard(card.id);

    const isAdmin = context.adminAccess?.isAdmin ?? false;
    return {
      card,
      printings: rows.map((row) =>
        toDeskPrintingRow(row, { createdByMe: mine.has(row.printingId), isAdmin }),
      ),
    };
  }),

  get: os.get.handler(async ({ input, context }) => {
    const { adminEvents, printingDesk } = context.repos;
    const row = await printingDesk.getDeskPrinting(input.printingId);
    assertFound(row, "Printing not found");

    const createdByMe = await adminEvents.wasPrintingCreatedBy(input.printingId, context.userId);
    const images = await printingDesk.listDeskImages(input.printingId);
    const deletable = await imagesDeletableBy(
      context.repos,
      context.adminAccess,
      context.userId,
      images.map((image) => image.printingImageId),
    );

    return {
      printing: toDeskPrintingRow(row, {
        createdByMe,
        isAdmin: context.adminAccess?.isAdmin ?? false,
      }),
      images: toDeskImages(images, deletable),
    };
  }),

  create: os.create.handler(async ({ input, context }) => {
    const printingId = await createDeskPrinting(
      context.transact,
      context.repos,
      context.io,
      context.userId,
      input,
    );
    return { printingId };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    await updateDeskPrinting(
      context.transact,
      context.repos,
      context.adminAccess,
      context.userId,
      input,
    );
  }),

  updateImage: os.updateImage.handler(async ({ input, context }): Promise<void> => {
    const { printingDesk } = context.repos;
    const { imageFileId, ...patch } = input;

    const current = await printingDesk.getImageCredit(imageFileId);
    assertFound(current, "Image file not found");
    await assertDeskImageFileScope(context.repos, context.adminAccess, context.userId, imageFileId);

    await printingDesk.updateImageCredit(imageFileId, patch);

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.credit",
      entityType: "image",
      entityId: imageFileId,
      oldValues: { ...current },
      newValues: { ...current, ...patch },
    });
  }),

  setImageFace: os.setImageFace.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { printingImageId, face } = input;

    const image = await printingImages.getForActivate(printingImageId);
    assertFound(image, "Printing image not found");
    await assertDeskPrintingScope(
      context.repos,
      context.adminAccess,
      context.userId,
      image.printingId,
    );

    if (image.face === face) {
      return;
    }

    await printingImages.setFace(printingImageId, face);

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.face",
      entityType: "image",
      entityId: printingImageId,
      oldValues: { face: image.face },
      newValues: { face },
    });

    await context.repos.catalog.refreshCatalogViews();
  }),
};
