import { defaultIo } from "../../../io.js";
import { renderDeckImage } from "../../decks/services/deck-image.js";
import { renderTierListImage } from "../../stage/services/tier-list-image.js";
import type { RenderJob, RenderResponse } from "./render-job.js";
import { renderShareImage } from "./share-image.js";

declare const self: Worker;

function render(job: RenderJob): Promise<Buffer> {
  if (job.kind === "deck") {
    return renderDeckImage(defaultIo, job.input, job.scale, job.aspect);
  }
  if (job.kind === "tierList") {
    return renderTierListImage(defaultIo, job.input, job.scale, job.aspect);
  }
  return renderShareImage(defaultIo, job.input, job.scale, job.options);
}

async function handleMessage(id: number, job: RenderJob): Promise<void> {
  try {
    const png = await render(job);
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage takes no target origin
    self.postMessage({ id, ok: true, png });
  } catch (error) {
    // The stack is the worker's, so it has to travel with the message or the
    // route only ever sees "render failed" with no frames.
    const failure: RenderResponse = {
      id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage takes no target origin
    self.postMessage(failure);
  }
}

self.addEventListener("message", (event: MessageEvent<{ id: number; job: RenderJob }>) => {
  void handleMessage(event.data.id, event.data.job);
});
