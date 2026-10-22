import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileEditor } from "../ConnectedApp";
import ValidatedForm from "./ValidatedForm";
import { Toast } from "./Feedback";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("requires confirmation before changing a role and allows cancelling without saving", async () => {
  const u = userEvent.setup();
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <ProfileEditor
      index={1}
      profile={{
        id: "qa",
        email: "qa@example.invalid",
        display_name: "QA",
        role: "messenger",
        active: true,
      }}
      saving={false}
      onSave={save}
    />,
  );
  await u.selectOptions(screen.getByLabelText(/บทบาท/), "super_user");
  await u.click(screen.getByRole("button", { name: "บันทึก" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  await u.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(save).not.toHaveBeenCalled();
  await u.click(screen.getByRole("button", { name: "บันทึก" }));
  await u.click(screen.getByRole("button", { name: "ยืนยันการเปลี่ยนสิทธิ์" }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ role: "super_user", active: true }),
  );
});
it("shows a Thai inline validation message and clears it after valid input", async () => {
  const u = userEvent.setup();
  render(
    <ValidatedForm>
      <label>
        อีเมล
        <input type="email" required />
      </label>
      <button>ส่ง</button>
    </ValidatedForm>,
  );
  const input = screen.getByRole("textbox");
  fireEvent.invalid(input);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("กรุณาระบุอีเมล")).toBeTruthy();
  await u.type(input, "qa@example.invalid");
  expect(input.getAttribute("aria-invalid")).toBeNull();
  expect(screen.queryByText("กรุณาระบุอีเมล")).toBeNull();
});
it("dismisses a toast after its timeout", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  render(<Toast message="บันทึกสำเร็จ" onClose={close} />);
  vi.advanceTimersByTime(6000);
  expect(close).toHaveBeenCalledTimes(1);
});
it("blocks invalid submission and focuses the first required field", async () => {
  const u = userEvent.setup();
  const submit = vi.fn();
  render(
    <ValidatedForm
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label>
        ชื่องาน
        <input required />
      </label>
      <button>ส่ง</button>
    </ValidatedForm>,
  );
  await u.click(screen.getByRole("button", { name: "ส่ง" }));
  expect(submit).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole("textbox"));
  expect(screen.getByText("กรุณาระบุชื่องาน")).toBeTruthy();
});
