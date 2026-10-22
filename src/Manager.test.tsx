import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import Manager from "./Manager";
import type { Snapshot } from "./lib/workspace";
afterEach(cleanup);
const snapshot: Snapshot = {
  profile: { id: "admin", role: "admin", display_name: "Admin", active: true },
  profiles: [],
  messengers: [],
  order: [],
  jobs: [
    {
      id: "MSG-26100001",
      title: "เอกสารลูกค้า",
      person: "ผู้มอบหมาย",
      department: "บัญชี",
      messengerName: "Messenger1",
      status: "new",
      stops: [
        {
          id: "stop",
          name: "ปลายทาง",
          address: "ที่อยู่",
          kind: "ส่งเอกสาร",
          status: "pending",
        },
      ],
    },
  ],
};
it("filters the management list and opens job details without showing the Messenger navigation", async () => {
  const u = userEvent.setup();
  render(
    <Manager
      snapshot={snapshot}
      users={<p>Accounts</p>}
      busy={false}
      onCommand={vi.fn()}
      onRefresh={vi.fn()}
      onLogout={vi.fn()}
    />,
  );
  await u.click(screen.getByRole("button", { name: /MSG-26100001/ }));
  expect(
    screen.getByRole("complementary", { name: "รายละเอียดงาน" }),
  ).toBeTruthy();
  expect(screen.getByText("ปลายทาง")).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "เมนูหลัก" })).toBeNull();
  await u.type(screen.getByRole("textbox", { name: "ค้นหางาน" }), "missing");
  expect(screen.getByText("ไม่พบงานตามตัวกรอง")).toBeTruthy();
});
it("retains operational commands and hides account management for Super User", async () => {
  const command = vi.fn().mockResolvedValue(undefined);
  const u = userEvent.setup();
  render(
    <Manager
      snapshot={{
        ...snapshot,
        profile: { ...snapshot.profile!, role: "super_user" },
      }}
      users={null}
      busy={false}
      onCommand={command}
      onRefresh={vi.fn()}
      onLogout={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: /บัญชีผู้ใช้/ })).toBeNull();
  await u.click(screen.getByRole("button", { name: /MSG-26100001/ }));
  await u.click(screen.getByRole("button", { name: "รับงาน" }));
  expect(command).toHaveBeenCalledWith(
    snapshot.jobs[0],
    "accept",
    undefined,
    "",
  );
});
it.each(["admin", "super_user"] as const)(
  "makes accepted jobs read only for %s",
  async (role) => {
    const u = userEvent.setup();
    const command = vi.fn();
    render(
      <Manager
        snapshot={{
          ...snapshot,
          profile: { ...snapshot.profile!, role },
          jobs: [{ ...snapshot.jobs[0], status: "active" }],
        }}
        users={null}
        busy={false}
        onCommand={command}
        onRefresh={vi.fn()}
        onLogout={vi.fn()}
      />,
    );
    await u.click(screen.getByRole("button", { name: /MSG-26100001/ }));
    expect(screen.queryByRole("button", { name: "รับงาน" })).toBeNull();
    expect(screen.queryByRole("button", { name: "สำเร็จ" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /หมายเหตุ/ })).toBeNull();
    expect(
      screen.getAllByRole("columnheader").map((x) => x.textContent),
    ).toEqual([
      "ลำดับ",
      "วันที่",
      "เลขงาน",
      "ชื่องาน",
      "แผนก",
      "ผู้มอบหมาย",
      "ผู้รับส่งเอกสาร",
      "สถานะ",
      "ความคืบหน้า",
    ]);
    expect(command).not.toHaveBeenCalled();
  },
);
it("links to the single public form and removes the duplicate menu and create button", () => {
  render(
    <Manager
      snapshot={snapshot}
      users={null}
      busy={false}
      onCommand={vi.fn()}
      onRefresh={vi.fn()}
      onLogout={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("link", { name: "แบบฟอร์ม" }).getAttribute("href"),
  ).toBe(
    "https://suttipat-cmd.github.io/document-messenger-management/#/request",
  );
  expect(screen.queryByRole("link", { name: /ฟอร์มสร้างงาน/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /สร้างงาน/ })).toBeNull();
  expect(screen.getByRole("link", { name: /บริหารงานบริการ/ })).toBeTruthy();
});
it("combines department, assignee, status and inclusive date filters and clears them together", async () => {
  const u = userEvent.setup();
  const a = { ...snapshot.jobs[0], jobDate: "2026-10-22", messengerId: "m1" };
  const jobs = [
    a,
    {
      ...a,
      id: "MSG-26100002",
      jobDate: "2026-10-21",
      department: "บริหาร",
      messengerId: "m2",
      messengerName: "Messenger2",
      status: "active" as const,
    },
    { ...a, id: "MSG-26100003", jobDate: "2026-10-23" },
  ];
  render(
    <Manager
      snapshot={{ ...snapshot, jobs }}
      users={null}
      busy={false}
      onCommand={vi.fn()}
      onRefresh={vi.fn()}
      onLogout={vi.fn()}
    />,
  );
  await u.selectOptions(screen.getByLabelText("แผนก"), "บัญชี");
  await u.selectOptions(screen.getByLabelText("ผู้รับงาน"), "m1");
  await u.selectOptions(screen.getByLabelText("สถานะงาน"), "new");
  fireEvent.change(screen.getByLabelText("ตั้งแต่วันที่"), {
    target: { value: "2026-10-22" },
  });
  fireEvent.change(screen.getByLabelText("ถึงวันที่"), {
    target: { value: "2026-10-22" },
  });
  expect(screen.getAllByRole("button", { name: /MSG-/ })).toHaveLength(1);
  expect(screen.getByRole("status").textContent).toBe("1 จาก 3 งาน");
  await u.click(screen.getByRole("button", { name: "ล้างตัวกรอง" }));
  expect(screen.getAllByRole("button", { name: /MSG-/ })).toHaveLength(3);
  expect(screen.getByLabelText("ตั้งแต่วันที่").getAttribute("value")).toBe("");
  fireEvent.change(screen.getByLabelText("ตั้งแต่วันที่"), {
    target: { value: "2026-10-23" },
  });
  fireEvent.change(screen.getByLabelText("ถึงวันที่"), {
    target: { value: "2026-10-22" },
  });
  expect(screen.getByRole("alert").textContent).toBe(
    "วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด",
  );
  expect(screen.queryByRole("button", { name: /MSG-/ })).toBeNull();
});
it("paginates after filtering, keeps global row numbers and resets to page one when filters change", async () => {
  const u = userEvent.setup();
  const jobs = Array.from({ length: 25 }, (_, i) => ({
    ...snapshot.jobs[0],
    id: `MSG-2610${String(i + 1).padStart(4, "0")}`,
    title: "งาน " + (i + 1),
    department: i < 12 ? "บัญชี" : "บริหาร",
  }));
  render(
    <Manager
      snapshot={{ ...snapshot, jobs }}
      users={null}
      busy={false}
      onCommand={vi.fn()}
      onRefresh={vi.fn()}
      onLogout={vi.fn()}
    />,
  );
  expect(screen.getAllByRole("button", { name: /MSG-/ })).toHaveLength(10);
  await u.click(screen.getByRole("button", { name: "หน้าถัดไป" }));
  expect(
    screen.getAllByRole("button", { name: /MSG-/ })[0].textContent,
  ).toContain("MSG-26100011");
  expect(
    screen.getAllByRole("button", { name: /MSG-/ })[0].querySelector(".ordinal")
      ?.textContent,
  ).toBe("11");
  await u.selectOptions(screen.getByLabelText("แผนก"), "บริหาร");
  expect(
    screen.getByRole("button", { name: "หน้าก่อนหน้า" }).matches(":disabled"),
  ).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("13 จาก 25 งาน");
  await u.click(screen.getByRole("button", { name: "ลบตัวกรอง บริหาร" }));
  expect(screen.getByLabelText("แผนก").getAttribute("value")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("25 งาน");
});
it("switches the detail history tab using the keyboard", async () => {
  const u = userEvent.setup();
  render(
    <Manager
      snapshot={snapshot}
      users={null}
      busy={false}
      onCommand={vi.fn()}
      onRefresh={vi.fn()}
      onLogout={vi.fn()}
    />,
  );
  await u.click(screen.getByRole("button", { name: /MSG-/ }));
  const details = screen.getByRole("tab", { name: "รายละเอียด" });
  details.focus();
  await u.keyboard("{ArrowRight}");
  expect(
    screen.getByRole("tab", { name: "ประวัติ" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.getByRole("tabpanel").textContent).toContain("ยังไม่มีประวัติ");
});
