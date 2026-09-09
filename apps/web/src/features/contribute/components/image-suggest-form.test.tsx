import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => {
    let path = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`$${key}`, value);
      }
    }
    return (
      <a href={path} className={className}>
        {children}
      </a>
    );
  },
}));

const submitState = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  error: null as Error | null,
}));

vi.mock("@/features/contribute/hooks/use-card-submission", () => ({
  useSubmitCard: () => submitState,
}));

const missingImages = vi.hoisted(() => ({ items: [] as MissingImagePrinting[] }));

vi.mock("@/features/contribute/hooks/use-missing-images", () => ({
  useMyMissingImages: () => ({ data: { items: missingImages.items } }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { ImageSuggestForm } from "@/features/contribute/components/image-suggest-form";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { initKeys } from "@/lib/query-keys";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { stubMissingImagePrinting, stubPrinting } from "@/test/factories";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { MISSING_IMAGE_ENUMS, stubInitResponse } from "@/test/init-fixtures";

const UPLOADED_URL = "/media/submissions/11111111-2222-3333-4444-555555555555.jpg";

const printing = stubPrinting({
  id: "printing-1",
  publicCode: "OGN-066/298",
  finish: "normal",
  language: "EN",
  card: { slug: "ahri-alluring", name: "Ahri, Alluring" },
});

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(initKeys.all, stubInitResponse(MISSING_IMAGE_ENUMS));
  return render(
    <QueryClientProvider client={client}>
      <ImageSuggestForm card={printing.card} printing={printing} setSlug="ogn" setName="Origins" />
    </QueryClientProvider>,
  );
}

function photo() {
  return new File(["bytes"], "card.jpg", { type: "image/jpeg" });
}

function respondWith(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  submitState.mutate.mockClear();
  submitState.isSuccess = false;
  missingImages.items = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ImageSuggestForm", () => {
  it("uploads a chosen photo as multipart and previews it", async () => {
    const user = userEvent.setup();
    const fetchMock = respondWith(200, { url: UPLOADED_URL });
    vi.stubGlobal("fetch", fetchMock);
    renderForm();

    await user.upload(screen.getByLabelText("Take a photo or choose one"), photo());

    expect(await screen.findByRole("img")).toHaveAttribute("src", UPLOADED_URL);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/v1/card-submissions/images");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("submits the uploaded photo as the printing's image", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", respondWith(200, { url: UPLOADED_URL }));
    renderForm();

    await user.upload(screen.getByLabelText("Take a photo or choose one"), photo());
    await screen.findByRole("img");
    await user.click(screen.getByRole("button", { name: /Submit image suggestion/u }));

    expect(submitState.mutate).toHaveBeenCalledTimes(1);
    expect(submitState.mutate.mock.calls[0]![0].printings[0].image_url).toBe(UPLOADED_URL);
  });

  it("explains a rejected upload in the contributor's words", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", respondWith(413, {}));
    renderForm();

    await user.upload(screen.getByLabelText("Take a photo or choose one"), photo());

    expect(await screen.findByText(/larger than 20 MB/u)).toBeInTheDocument();
  });

  it("submits a pasted link when no photo was uploaded", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByLabelText("Or paste a link to an image"),
      "https://example.test/card.png",
    );
    await user.click(screen.getByRole("button", { name: /Submit image suggestion/u }));

    expect(submitState.mutate.mock.calls[0]![0].printings[0].image_url).toBe(
      "https://example.test/card.png",
    );
  });

  it("lists the cards still missing an image once the suggestion is in", () => {
    submitState.isSuccess = true;
    missingImages.items = [
      stubMissingImagePrinting(2, { cardSlug: "yasuo-windchaser", cardName: "Yasuo, Windchaser" }),
      stubMissingImagePrinting(3),
    ];
    renderForm();

    expect(screen.getByRole("link", { name: /Yasuo, Windchaser/u })).toHaveAttribute(
      "href",
      "/contribute/card/yasuo-windchaser/printing/printing-2/image",
    );
  });

  it("drops the printing just submitted from the list", () => {
    submitState.isSuccess = true;
    missingImages.items = [
      stubMissingImagePrinting(1, { cardName: "Ahri, Alluring" }),
      stubMissingImagePrinting(2, { cardName: "Yasuo, Windchaser" }),
    ];
    renderForm();

    expect(screen.queryByText("Ahri, Alluring")).not.toBeInTheDocument();
    expect(screen.getByText("Yasuo, Windchaser")).toBeInTheDocument();
  });

  it("says the run is over when nothing is left", () => {
    submitState.isSuccess = true;
    renderForm();

    expect(screen.getByText("All your cards have images now. Thanks!")).toBeInTheDocument();
  });
});
