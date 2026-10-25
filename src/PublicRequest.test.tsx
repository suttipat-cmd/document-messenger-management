import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const api = vi.hoisted(() => ({
  load: vi.fn(),
  submit: vi.fn(),
  upload: vi.fn(),
  finish: vi.fn(),
}));
vi.mock("./lib/public-requests", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("./lib/public-requests")
  >();
  return {
    ...original,
    loadPublicMessengers: api.load,
    submitPublicRequest: api.submit,
    uploadPublicPhoto: api.upload,
    finishPublicPhotos: api.finish,
  };
});
import PublicRequest from "./PublicRequest";
import { prepareImage } from "./lib/evidence";
vi.mock("./lib/evidence", () => ({ prepareImage: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.mocked(prepareImage).mockResolvedValue(
    new Blob(["photo"], { type: "image/jpeg" }),
  );
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:qa"),
      revokeObjectURL: vi.fn(),
    }),
  );
  api.load.mockResolvedValue([{ id: "messenger-1", name: "Messenger One" }]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fill() {
  const u = userEvent.setup();
  await screen.findByRole("option", { name: "Messenger One" });
  await u.type(screen.getByLabelText("ชื่องาน *"), "รับส่งสัญญา");
  await u.type(screen.getByLabelText("ชื่อผู้มอบหมาย *"), "ผู้มอบหมายทดสอบ");
  await u.type(screen.getByLabelText("เบอร์ติดต่อผู้มอบหมาย"), "0800000000");
  await u.selectOptions(screen.getByLabelText("แผนก *"), "บัญชี");
  await u.selectOptions(
    screen.getByLabelText("ผู้รับส่งเอกสาร *"),
    "messenger-1",
  );
  await u.type(screen.getByLabelText("ชื่อสถานที่จุดที่ 1 *"), "สถานที่รับ");
  await u.type(screen.getByLabelText("ที่อยู่จุดที่ 1"), "ที่อยู่ทดสอบ");
  return u;
}
it("creates multi-stop work without authentication and shows only a receipt", async () => {
  api.submit.mockResolvedValue({ code: "MSG-RECEIPT" });
  render(<PublicRequest />);
  const u = await fill();
  await u.click(screen.getByRole("button", { name: "+ เพิ่มจุดรับ–ส่ง" }));
  await u.type(screen.getByLabelText("ชื่อสถานที่จุดที่ 2 *"), "สถานที่ส่ง");
  await u.type(screen.getByLabelText("ที่อยู่จุดที่ 2"), "ที่อยู่ส่ง");
  await u.click(screen.getByRole("button", { name: "ตรวจสอบก่อนส่ง →" }));
  expect(screen.getByRole("heading", { name: "ตรวจสอบก่อนส่ง" })).toBeTruthy();
  await u.click(screen.getByRole("button", { name: "ยืนยันส่งงาน" }));
  await screen.findByRole("heading", { name: "ส่งงานเรียบร้อยแล้ว" });
  expect(screen.getByText("MSG-RECEIPT")).toBeTruthy();
  const [payload, key] = api.submit.mock.calls[0];
  expect(payload.stops).toHaveLength(2);
  expect(payload.stops[1].kind).toBe("ส่งเอกสาร");
  expect(payload.requesterPhone).toBe("0800000000");
  expect(key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(screen.queryByText("MSG-0261")).toBeNull();
});
it("retries an uncertain submission with the exact same key and payload", async () => {
  api.submit
    .mockRejectedValueOnce(new Error("Timeout"))
    .mockResolvedValueOnce({ code: "MSG-ONCE" });
  render(<PublicRequest />);
  const u = await fill();
  await u.click(screen.getByRole("button", { name: "ตรวจสอบก่อนส่ง →" }));
  await u.click(screen.getByRole("button", { name: "ยืนยันส่งงาน" }));
  const retry = await screen.findByRole("button", {
    name: "ตรวจผลการส่งอีกครั้ง",
  });
  expect(
    screen
      .getByRole("button", { name: "กลับไปแก้ไขข้อมูล" })
      .matches(":disabled"),
  ).toBe(true);
  await u.click(retry);
  await screen.findByText("MSG-ONCE");
  expect(api.submit.mock.calls[1]).toEqual(api.submit.mock.calls[0]);
});
it("blocks submission when there is no active messenger", async () => {
  api.load.mockResolvedValue([]);
  render(<PublicRequest />);
  await screen.findByText(
    "ยังไม่มีผู้รับส่งเอกสาร พร้อมรับงาน กรุณาติดต่อผู้ดูแลก่อนส่งงาน",
  );
  expect(
    screen
      .getByRole("button", { name: "ตรวจสอบก่อนส่ง →" })
      .matches(":disabled"),
  ).toBe(true);
  expect(api.submit).not.toHaveBeenCalled();
});
it("does not double-submit while the first request is pending", async () => {
  let resolve!: (v: { code: string }) => void;
  api.submit.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<PublicRequest />);
  const u = await fill();
  await u.click(screen.getByRole("button", { name: "ตรวจสอบก่อนส่ง →" }));
  await u.dblClick(screen.getByRole("button", { name: "ยืนยันส่งงาน" }));
  expect(api.submit).toHaveBeenCalledTimes(1);
  resolve({ code: "MSG-SINGLE" });
  await waitFor(() => expect(screen.getByText("MSG-SINGLE")).toBeTruthy());
});
it("allows blank phone and address while requiring a master department and a date", async () => {
  api.submit.mockResolvedValue({ code: "MSG-26100002" });
  render(<PublicRequest />);
  const u = await fill();
  await u.clear(screen.getByLabelText("เบอร์ติดต่อผู้มอบหมาย"));
  await u.clear(screen.getByLabelText("ที่อยู่จุดที่ 1"));
  const date = screen.getByLabelText("วันที่ *") as HTMLInputElement;
  const chosenDate = date.value;
  expect(chosenDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(screen.getByLabelText("แผนก *").hasAttribute("required")).toBe(true);
  expect(
    screen.getByLabelText("แผนก *").querySelectorAll("option"),
  ).toHaveLength(31);
  expect(
    screen.getByLabelText("เบอร์ติดต่อผู้มอบหมาย").hasAttribute("required"),
  ).toBe(false);
  expect(
    screen.getByLabelText("ที่อยู่จุดที่ 1").hasAttribute("required"),
  ).toBe(false);
  await u.click(screen.getByRole("button", { name: "ตรวจสอบก่อนส่ง →" }));
  await u.click(screen.getByRole("button", { name: "ยืนยันส่งงาน" }));
  await screen.findByText("MSG-26100002");
  expect(api.submit.mock.calls[0][0]).toMatchObject({
    department: "บัญชี",
    requesterPhone: "",
    jobDate: chosenDate,
    stops: [
      {
        name: "สถานที่รับ",
        address: "",
        kind: "รับเอกสาร",
        contact: "",
        phone: "",
      },
    ],
  });
});

it("keeps a created job and identical photo IDs on retry until all attachments finish", async () => {
  api.submit.mockResolvedValue({
    code: "MSG-PHOTO",
    uploadToken: "qa-only",
    stops: [{ id: "stop-1", point: 1 }],
  });
  api.upload.mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(
    undefined,
  );
  api.finish.mockResolvedValue(undefined);
  render(<PublicRequest />);
  const u = await fill();
  fireEvent.change(screen.getByLabelText("ภาพจุดที่ 1"), {
    target: { files: [new File(["source"], "a.jpg", { type: "image/jpeg" })] },
  });
  await screen.findByRole("img", { name: "ภาพแนบ 1" });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "ตรวจสอบก่อนส่ง →" }).matches(
        ":disabled",
      ),
    ).toBe(false)
  );
  await u.click(screen.getByRole("button", { name: "ตรวจสอบก่อนส่ง →" }));
  await u.click(screen.getByRole("button", { name: "ยืนยันส่งงาน" }));
  const retry = await screen.findByRole("button", { name: "ตรวจผลการส่งอีกครั้ง" });
  expect(screen.queryByRole("heading", { name: "ส่งงานเรียบร้อยแล้ว" })).toBeNull();
  expect(api.finish).not.toHaveBeenCalled();
  await u.click(retry);
  await screen.findByRole("heading", { name: "ส่งงานเรียบร้อยแล้ว" });
  expect(api.submit.mock.calls[1]).toEqual(api.submit.mock.calls[0]);
  expect(api.upload.mock.calls[1]).toEqual(api.upload.mock.calls[0]);
  expect(api.submit.mock.calls[0][0].photoCounts).toEqual([1]);
  expect(api.finish).toHaveBeenCalledTimes(1);
});
