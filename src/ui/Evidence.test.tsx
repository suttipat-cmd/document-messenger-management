import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EvidencePanel from "./Evidence";
import {
  evidenceList,
  evidenceRead,
  evidenceReady,
  evidenceUpload,
  prepareImage,
} from "../lib/evidence";
vi.mock("../lib/evidence", () => ({
  evidenceList: vi.fn(),
  evidenceReady: vi.fn(),
  evidenceRead: vi.fn(),
  evidenceUpload: vi.fn(),
  prepareImage: vi.fn(),
}));
const item = {
  id: "photo",
  job_id: "job",
  stop_id: "stop",
  purpose: "stop" as const,
  filename: "หลักฐาน.jpg",
  mime_type: "image/jpeg",
  byte_size: 10,
  created_at: "2026-10-22",
};
beforeEach(() => {
  vi.mocked(evidenceList).mockResolvedValue([]);
  vi.mocked(evidenceReady).mockResolvedValue(true);
  vi.mocked(prepareImage).mockResolvedValue(
    new Blob(["photo"], { type: "image/jpeg" }),
  );
  vi.mocked(evidenceUpload).mockResolvedValue({ id: "photo" });
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:qa"),
      revokeObjectURL: vi.fn(),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("shows uploads only for an editable point with a working backend", async () => {
  const { rerender } = render(
    <EvidencePanel key="edit" jobId="job" stopId="stop" editable />,
  );
  expect(await screen.findByRole("button", { name: "ถ่ายรูป" })).toBeTruthy();
  rerender(<EvidencePanel key="read" jobId="job" stopId="stop" />);
  expect(await screen.findByText("ยังไม่มีรูปหลักฐาน")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "ถ่ายรูป" })).toBeNull();
});
it("retains the prepared image for an idempotent retry and only confirms after upload", async () => {
  const u = userEvent.setup();
  vi.mocked(evidenceUpload)
    .mockRejectedValueOnce(Error("เครือข่ายขัดข้อง"))
    .mockResolvedValueOnce({ id: "photo" });
  render(<EvidencePanel jobId="job" stopId="stop" editable />);
  await screen.findByRole("button", { name: "เลือกภาพ" });
  fireEvent.change(screen.getByLabelText("เลือกภาพหลักฐาน"), {
    target: {
      files: [new File(["input"], "photo.png", { type: "image/png" })],
    },
  });
  expect(await screen.findByText("เครือข่ายขัดข้อง")).toBeTruthy();
  expect(screen.queryByText("บันทึกภาพแล้ว")).toBeNull();
  await u.click(
    screen.getByRole("button", { name: "ลองบันทึกภาพเดิมอีกครั้ง" }),
  );
  expect(await screen.findByText("บันทึกภาพแล้ว")).toBeTruthy();
  expect(prepareImage).toHaveBeenCalledTimes(1);
  expect(vi.mocked(evidenceUpload).mock.calls[0][3]).toBe(
    vi.mocked(evidenceUpload).mock.calls[1][3],
  );
});
it("automatically loads a private preview, reuses it when expanded and releases on unmount", async () => {
  const u = userEvent.setup();
  vi.mocked(evidenceList).mockResolvedValue([item]);
  vi.mocked(evidenceRead).mockResolvedValue(
    new Blob(["image"], { type: "image/jpeg" }),
  );
  const { unmount } = render(<EvidencePanel jobId="job" stopId="stop" />);
  expect(await screen.findByRole("img", { name: "ภาพแนบ 1" })).toBeTruthy();
  await u.click(await screen.findByRole("button", { name: "ขยายภาพ 1" }));
  expect(
    await screen.findByRole("img", { name: "รูปหลักฐานการดำเนินการ" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "ดาวน์โหลดภาพ" }).getAttribute("href"),
  ).toBe("blob:qa");
  await u.click(screen.getByRole("button", { name: "ปิดหน้าต่าง" }));
  expect(evidenceRead).toHaveBeenCalledTimes(1);
  unmount();
  await waitFor(() =>
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qa")
  );
});
it("shows errors instead of successful photo placeholders", async () => {
  vi.mocked(evidenceList).mockResolvedValue([item]);
  vi.mocked(evidenceRead).mockRejectedValue(Error("ไม่มีสิทธิ์ดูภาพนี้"));
  render(<EvidencePanel jobId="job" stopId="stop" />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByText("โหลดภาพไม่สำเร็จ")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "ดาวน์โหลดภาพ" })).toBeNull();
});
