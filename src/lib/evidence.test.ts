import { afterEach, expect, it, vi } from "vitest";
import { evidenceRead } from "./evidence";
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { auth: { getSession } } }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("reads image bytes as binary with user authentication in headers", async () => {
  getSession.mockResolvedValue({
    data: { session: { access_token: "qa-only-token" } },
    error: null,
  });
  vi.stubEnv("VITE_SUPABASE_URL", "https://qa.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_qa");
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(new Uint8Array([255, 216, 255, 217]), {
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const blob = await evidenceRead("qa-id");
  expect(blob.type).toBe("image/jpeg");
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
    new Uint8Array([255, 216, 255, 217]),
  );
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://qa.supabase.co/functions/v1/messenger-evidence",
  );
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer qa-only-token",
  );
});
it("does not fetch an image without a signed-in session", async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(evidenceRead("qa-id")).rejects.toThrow("กรุณาเข้าสู่ระบบใหม่");
  expect(fetcher).not.toHaveBeenCalled();
});
