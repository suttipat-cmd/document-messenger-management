import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const evidence = () =>
  new File([new Uint8Array([137, 80, 78, 71])], "evidence.png", {
    type: "image/png",
  });
const findJob = (code: string) =>
  screen.getByText(code, { selector: ".task .code" }).closest("article")!;

describe("Messenger prototype workflows", () => {
  it("accepts a job once, searches it and orders stops across jobs", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(
      within(findJob("MSG-0262")).getByRole("button", { name: "รับงาน" }),
    );
    expect(
      within(findJob("MSG-0262")).queryByRole("button", { name: "รับงาน" }),
    ).toBeNull();
    await u.type(
      screen.getByRole("textbox", { name: "ค้นหางานหรือสถานที่" }),
      "สัญญา",
    );
    expect(screen.getAllByRole("article").length).toBe(1);
    await u.click(screen.getByRole("button", { name: "ล้างคำค้นหา" }));
    await u.click(screen.getByRole("button", { name: "จุดรับ–ส่ง" }));
    await u.click(screen.getByRole("button", { name: "⇅ จัดลำดับ" }));
    await u.click(
      screen.getByRole("button", { name: "เลื่อน สำนักงานพระราม 9 ขึ้น" }),
    );
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((x) => x.textContent)
        .slice(0, 3),
    ).toEqual(["ธนาคารกสิกรไทย", "สำนักงานพระราม 9", "อาคารสาทรธานี"]);
    await u.click(screen.getByRole("button", { name: "✓ เสร็จแล้ว" }));
    await u.type(
      screen.getByRole("textbox", { name: "ค้นหางานหรือสถานที่" }),
      "จีทาวเวอร์",
    );
    expect(screen.getAllByRole("article").length).toBe(1);
  });

  it("requires evidence for success, records a retry reason, and closes only after all stops finish", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(
      within(findJob("MSG-0261")).getByRole("button", { name: "ทำต่อ →" }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "ยืนยันสำเร็จพร้อมรูปหลักฐาน ✓",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await u.click(screen.getByRole("button", { name: "เก็บไว้กลับมาทำใหม่" }));
    expect(screen.getByRole("status").textContent).toContain("ระบุเหตุผล");
    await u.type(screen.getByRole("textbox"), "สถานที่ปิด");
    await u.click(screen.getByRole("button", { name: "เก็บไว้กลับมาทำใหม่" }));
    expect(
      screen.getByText("กลับมาทำใหม่: ธนาคารกสิกรไทย · สถานที่ปิด"),
    ).toBeTruthy();
    const bank = screen
      .getByRole("heading", { name: "ธนาคารกสิกรไทย" })
      .closest("article")!;
    await u.click(within(bank).getByRole("button", { name: "ดำเนินการ" }));
    await u.upload(
      screen.getByLabelText("ถ่ายหรือเลือกรูปหลักฐาน"),
      evidence(),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "ยืนยันสำเร็จพร้อมรูปหลักฐาน ✓",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    await u.click(
      screen.getByRole("button", { name: "ยืนยันสำเร็จพร้อมรูปหลักฐาน ✓" }),
    );
    expect(
      screen.getByText("สำเร็จ: ธนาคารกสิกรไทย · มีรูปหลักฐาน"),
    ).toBeTruthy();
    const finalStop = screen
      .getByRole("heading", { name: "อาคารสาทรธานี" })
      .closest("article")!;
    await u.click(within(finalStop).getByRole("button", { name: "ดำเนินการ" }));
    await u.upload(
      screen.getByLabelText("ถ่ายหรือเลือกรูปหลักฐาน"),
      evidence(),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "ยืนยันสำเร็จพร้อมรูปหลักฐาน ✓",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    await u.click(
      screen.getByRole("button", { name: "ยืนยันสำเร็จพร้อมรูปหลักฐาน ✓" }),
    );
    expect(
      screen.getByRole("heading", { name: "✓ งานเสร็จสิ้น" }),
    ).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "ประวัติ" }));
    expect(findJob("MSG-0261")).toBeTruthy();
    await u.selectOptions(screen.getByRole("combobox"), "today");
    expect(findJob("MSG-0261")).toBeTruthy();
  });

  it("requires return evidence and keeps unfinished returned stops read-only in history", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(
      within(findJob("MSG-0263")).getByRole("button", {
        name: "ยืนยันคืนเอกสาร",
      }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "ยืนยันคืนเอกสารและปิดงาน",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await u.upload(
      screen.getByLabelText("ถ่ายหรือเลือกรูปหลักฐาน"),
      evidence(),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "ยืนยันคืนเอกสารและปิดงาน",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    await u.click(
      screen.getByRole("button", { name: "ยืนยันคืนเอกสารและปิดงาน" }),
    );
    expect(
      screen.getByText("คืนเอกสารให้ผู้มอบหมายสำเร็จ · มีรูปหลักฐาน"),
    ).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "ดูหลักฐาน" }));
    expect(
      screen.queryByRole("button", { name: "ยืนยันสำเร็จพร้อมรูปหลักฐาน ✓" }),
    ).toBeNull();
    expect(
      screen.getByText("จุดนี้ยังไม่สำเร็จ เอกสารถูกคืนให้ผู้มอบหมายแล้ว"),
    ).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "บัญชี" }));
    await u.click(screen.getByRole("button", { name: "รีเซ็ตข้อมูลตัวอย่าง" }));
    expect(
      within(findJob("MSG-0263")).getByRole("button", {
        name: "ยืนยันคืนเอกสาร",
      }),
    ).toBeTruthy();
  });
});
