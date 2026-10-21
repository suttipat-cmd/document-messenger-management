import { cleanup, render, screen } from "@testing-library/react";
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
      onCreate={vi.fn()}
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
  expect(screen.getByText("ไม่พบงาน")).toBeTruthy();
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
      onCreate={vi.fn()}
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
        onCreate={vi.fn()}
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
