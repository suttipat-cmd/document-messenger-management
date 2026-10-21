import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  load: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
}));
vi.mock("./lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      getSession: mocks.getSession,
      signInWithPassword: mocks.signIn,
      signUp: mocks.signUp,
    },
    channel: () => {
      const c = { on: () => c, subscribe: vi.fn() };
      return c;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock("./lib/workspace", () => ({
  loadWorkspace: mocks.load,
  command: vi.fn(),
  reorder: vi.fn(),
  createJob: vi.fn(),
  setProfile: vi.fn(),
  errorText: () => "เชื่อมต่อหรือบันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
}));
import ConnectedApp from "./ConnectedApp";
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("shows the real Auth login screen and submits only credentials to Supabase Auth", async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.signIn.mockResolvedValue({ error: { message: "Invalid" } });
  const u = userEvent.setup();
  render(<ConnectedApp />);
  await screen.findByRole("heading", { name: "เข้าสู่ระบบ" });
  await u.type(screen.getByLabelText(/อีเมล/), "test@example.invalid");
  await u.type(screen.getByLabelText(/รหัสผ่าน/), "test-password");
  await u.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));
  await waitFor(() =>
    expect(mocks.signIn).toHaveBeenCalledWith({
      email: "test@example.invalid",
      password: "test-password",
    }),
  );
  expect(screen.getByRole("status").textContent).toContain(
    "เข้าสู่ระบบไม่สำเร็จ",
  );
  expect(screen.queryByText("MSG-0261")).toBeNull();
});
it("does not substitute demo jobs when authenticated data loading fails", async () => {
  mocks.getSession.mockResolvedValue({
    data: {
      session: { user: { id: "real-user", email: "real@example.invalid" } },
    },
  });
  mocks.load.mockRejectedValue(new Error("Network"));
  render(<ConnectedApp />);
  await screen.findByRole("alert");
  expect(screen.queryByText("MSG-0261")).toBeNull();
  expect(screen.getByRole("button", { name: "ลองโหลดใหม่" })).toBeTruthy();
});
it("blocks operational access for an inactive account", async () => {
  mocks.getSession.mockResolvedValue({
    data: {
      session: { user: { id: "real-user", email: "real@example.invalid" } },
    },
  });
  mocks.load.mockResolvedValue({
    jobs: [],
    order: [],
    messengers: [],
    profiles: [],
    profile: {
      id: "real-user",
      display_name: "Pending",
      role: "messenger",
      active: false,
    },
  });
  render(<ConnectedApp />);
  await screen.findByRole("heading", { name: "บัญชียังไม่ได้รับสิทธิ์" });
  expect(screen.queryByRole("button", { name: "จุดรับ–ส่ง" })).toBeNull();
});
