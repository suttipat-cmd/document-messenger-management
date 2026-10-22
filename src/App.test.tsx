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
import type { RemoteWorkspace } from "./App";
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const findJob = (code: string) =>
  screen.getByText(code, { selector: ".task .code" }).closest("article")!;
describe("Messenger Phase 1", () => {
  it("accepts, searches and reorders stops across jobs", async () => {
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
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await u.click(screen.getByRole("button", { name: "ล้างคำค้นหา" }));
    await u.click(screen.getByRole("button", { name: "จุดรับ–ส่ง" }));
    await u.click(screen.getByRole("button", { name: "⇅ จัดลำดับ" }));
    await u.click(
      screen.getByRole("button", { name: "เลื่อน สำนักงานพระราม 9 ขึ้น" }),
    );
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((e) => e.textContent)
        .slice(0, 3),
    ).toEqual(["ธนาคารกสิกรไทย", "สำนักงานพระราม 9", "อาคารสาทรธานี"]);
    await u.click(screen.getByRole("button", { name: "✓ เสร็จแล้ว" }));
    await u.type(
      screen.getByRole("textbox", { name: "ค้นหางานหรือสถานที่" }),
      "จีทาวเวอร์",
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });
  it("records retry reasons and completes every stop without requiring a photo in Phase 1", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(
      within(findJob("MSG-0261")).getByRole("button", { name: "ทำต่อ →" }),
    );
    expect(
      screen
        .getByRole("button", { name: /แนบรูปหลักฐาน/ })
        .matches(":disabled"),
    ).toBe(true);
    await u.click(screen.getByRole("button", { name: "เก็บไว้กลับมาทำใหม่" }));
    expect(screen.getByRole("status").textContent).toContain("ระบุเหตุผล");
    await u.type(screen.getByRole("textbox"), "สถานที่ปิด");
    await u.click(screen.getByRole("button", { name: "เก็บไว้กลับมาทำใหม่" }));
    expect(
      screen.getByText("กลับมาทำใหม่: ธนาคารกสิกรไทย · สถานที่ปิด"),
    ).toBeTruthy();
    await u.click(
      within(
        screen
          .getByRole("heading", { name: "ธนาคารกสิกรไทย" })
          .closest("article")!,
      ).getByRole("button", { name: "ดำเนินการ" }),
    );
    await u.click(
      screen.getByRole("button", { name: "ยืนยันดำเนินการสำเร็จ ✓" }),
    );
    await u.click(
      within(
        screen
          .getByRole("heading", { name: "อาคารสาทรธานี" })
          .closest("article")!,
      ).getByRole("button", { name: "ดำเนินการ" }),
    );
    await u.click(
      screen.getByRole("button", { name: "ยืนยันดำเนินการสำเร็จ ✓" }),
    );
    expect(
      screen.getByRole("heading", { name: "✓ งานเสร็จสิ้น" }),
    ).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "ประวัติ" }));
    await u.selectOptions(screen.getByRole("combobox"), "today");
    expect(findJob("MSG-0261")).toBeTruthy();
  });
  it("confirms physical return without photos and keeps returned stops read-only", async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(
      within(findJob("MSG-0263")).getByRole("button", {
        name: "ยืนยันคืนเอกสาร",
      }),
    );
    await u.click(
      screen.getByRole("button", { name: "ยืนยันคืนเอกสารและปิดงาน" }),
    );
    await u.click(screen.getByRole("button", { name: "ยืนยันคืนเอกสารแล้ว" }));
    expect(screen.getByText(/คืนเอกสารให้ผู้มอบหมายสำเร็จ/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "ดูหลักฐาน" }));
    expect(
      screen.queryByRole("button", { name: "ยืนยันดำเนินการสำเร็จ ✓" }),
    ).toBeNull();
    expect(
      screen.getByText("จุดนี้ยังไม่สำเร็จ เอกสารถูกคืนให้ผู้มอบหมายแล้ว"),
    ).toBeTruthy();
  });
  it("sends authenticated commands and does not invent success after a backend failure", async () => {
    const u = userEvent.setup();
    const onCommand = vi.fn().mockRejectedValue(new Error("Network"));
    const remote: RemoteWorkspace = {
      jobs: [
        {
          id: "LIVE-1",
          dbId: "uuid-1",
          version: 3,
          title: "Live Job",
          person: "Requester",
          department: "",
          status: "active",
          stops: [
            {
              id: "stop-1",
              name: "Live Stop",
              address: "Live Address",
              kind: "ส่งเอกสาร",
              status: "pending",
            },
          ],
        },
      ],
      order: ["stop-1"],
      profile: {
        id: "user-1",
        display_name: "Live User",
        role: "messenger",
        active: true,
      },
      saving: false,
      onCommand,
      onReorder: vi.fn(),
      onLogout: vi.fn(),
    };
    render(<App remote={remote} />);
    await u.click(screen.getByRole("button", { name: "ทำต่อ →" }));
    await u.click(
      screen.getByRole("button", { name: "ยืนยันดำเนินการสำเร็จ ✓" }),
    );
    await waitFor(() =>
      expect(onCommand).toHaveBeenCalledWith(
        remote.jobs[0],
        "complete_stop",
        "stop-1",
        "",
      ),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "ยังยืนยันผลไม่ได้",
    );
    expect(
      screen.queryByRole("heading", { name: "✓ งานเสร็จสิ้น" }),
    ).toBeNull();
  });
});
it("opens the mobile action sheet and preserves the reason requirement", async () => {
  const u = userEvent.setup();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  render(<App />);
  await u.click(
    within(findJob("MSG-0261")).getByRole("button", { name: "ทำต่อ →" }),
  );
  await u.click(screen.getByRole("button", { name: "ตัวเลือกเพิ่มเติม" }));
  const dialog = screen.getByRole("dialog");
  await u.click(
    within(dialog).getByRole("button", { name: "เก็บไว้กลับมาทำใหม่" }),
  );
  expect(screen.getByRole("status").textContent).toContain("ระบุเหตุผล");
  expect(screen.queryByRole("dialog")).toBeNull();
});
