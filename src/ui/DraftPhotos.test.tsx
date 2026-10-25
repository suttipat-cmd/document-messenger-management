import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DraftPhotos from "./DraftPhotos";
import { prepareImage } from "../lib/evidence";
vi.mock("../lib/evidence", () => ({ prepareImage: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("rejects a sixth image before preparing any file", async () => {
  const change = vi.fn();
  render(
    <DraftPhotos
      photos={Array.from(
        { length: 4 },
        (_, i) => ({ id: String(i), blob: new Blob(), url: "blob:qa" }),
      )}
      onChange={change}
      onBusy={vi.fn()}
      label="ภาพจุดที่ 1"
    />,
  );
  fireEvent.change(screen.getByLabelText("ภาพจุดที่ 1"), {
    target: { files: [new File(["a"], "a.jpg"), new File(["b"], "b.jpg")] },
  });
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "แนบได้ไม่เกิน 5 ภาพต่อจุด",
  );
  expect(prepareImage).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
});
it("prepares selected images and exposes previews for review", async () => {
  vi.mocked(prepareImage).mockResolvedValue(
    new Blob(["jpeg"], { type: "image/jpeg" }),
  );
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
  const change = vi.fn();
  render(
    <DraftPhotos
      photos={[]}
      onChange={change}
      onBusy={vi.fn()}
      label="ภาพจุดที่ 1"
    />,
  );
  fireEvent.change(screen.getByLabelText("ภาพจุดที่ 1"), {
    target: { files: [new File(["a"], "a.jpg")] },
  });
  await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(1));
  expect(change.mock.calls[0][0][0].url).toBe("blob:preview");
});
