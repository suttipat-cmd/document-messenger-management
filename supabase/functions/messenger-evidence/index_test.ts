import { assertEquals } from "jsr:@std/assert@1.0.19";
let handler: (r: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((h: typeof handler) => {
  handler = h;
  return {};
}) as typeof Deno.serve;
await import("./index.ts");
Deno.serve = serve;
const originalFetch = globalThis.fetch;
const secret = "qa-only-" + "a".repeat(64);
Deno.env.set("SUPABASE_URL", "https://qa.supabase.co");
Deno.env.set(
  "SUPABASE_PUBLISHABLE_KEYS",
  JSON.stringify({ default: "sb_publishable_qa" }),
);
Deno.env.set(
  "SUPABASE_SECRET_KEYS",
  JSON.stringify({ default: "sb_secret_qa" }),
);
Deno.env.set("DRIVE_BRIDGE_SECRET", secret);
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function sign(text: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const b = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(b), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
function mock(role = "messenger", valid = true, tamper = false) {
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user"))
      return valid
        ? json({ id: "11111111-1111-4111-8111-111111111111" })
        : json({ message: "Invalid JWT" }, 401);
    if (url.includes("/rest/v1/messenger_profiles"))
      return json({ role, active: true });
    if (url.includes("/rest/v1/messenger_jobs")) return json(null);
    if (url.startsWith("https://script.google.com/")) {
      const e = JSON.parse(String(init?.body));
      assertEquals(
        e.signature,
        await sign("v1\n" + e.ts + "\n" + e.nonce + "\n" + e.payload),
      );
      assertEquals(JSON.parse(e.payload).action, "health");
      const payload = JSON.stringify({ ok: true, data: { ready: true } });
      return json({
        v: 1,
        nonce: e.nonce,
        payload,
        signature: tamper
          ? "0".repeat(64)
          : await sign("v1-response\n" + e.nonce + "\n" + payload),
      });
    }
    throw Error("Unexpected request " + url);
  };
}
function req(
  method = "GET",
  body?: BodyInit,
  origin = "https://suttipat-cmd.github.io",
  auth = true,
) {
  return new Request("https://qa.supabase.co/functions/v1/messenger-evidence", {
    method,
    body,
    headers: {
      Origin: origin,
      ...(auth ? { Authorization: "Bearer qa-user-token" } : {}),
    },
  });
}
Deno.test("rejects unknown origin before upstream calls", async () => {
  mock();
  assertEquals(
    (await handler(req("GET", undefined, "https://unknown.test"))).status,
    403,
  );
});
Deno.test("requires an authenticated user, not just an API key", async () => {
  mock();
  assertEquals(
    (await handler(req("GET", undefined, undefined, false))).status,
    401,
  );
  mock("messenger", false);
  assertEquals((await handler(req())).status, 401);
});
Deno.test("health verifies the Apps Script response signature", async () => {
  mock();
  assertEquals(await (await handler(req())).json(), {
    ready: true,
    maxBytes: 2097152,
  });
  mock("messenger", true, true);
  assertEquals(await (await handler(req())).json(), { ready: false });
});
Deno.test("managers cannot upload evidence", async () => {
  mock("admin");
  const form = new FormData();
  form.set("file", new Blob(["image"], { type: "image/jpeg" }), "qa.jpg");
  assertEquals((await handler(req("POST", form))).status, 403);
});
Deno.test("another job is rejected before any Drive upload", async () => {
  mock();
  const form = new FormData();
  form.set("id", "22222222-2222-4222-8222-222222222222");
  form.set("jobId", "33333333-3333-4333-8333-333333333333");
  form.set("stopId", "44444444-4444-4444-8444-444444444444");
  form.set("purpose", "stop");
  form.set("file", new Blob(["image"], { type: "image/jpeg" }), "qa.jpg");
  assertEquals((await handler(req("POST", form))).status, 403);
});
Deno.test("read checks metadata visibility before Google access", async () => {
  mock();
  globalThis.fetch = async (input) => {
    const u = String(input instanceof Request ? input.url : input);
    if (u.includes("/auth/"))
      return json({ id: "11111111-1111-4111-8111-111111111111" });
    if (u.includes("messenger_profiles"))
      return json({ role: "messenger", active: true });
    if (u.includes("messenger_evidence")) return json(null);
    throw Error("Unauthorized Google call");
  };
  const r = req(
    "POST",
    JSON.stringify({
      action: "read",
      id: "22222222-2222-4222-8222-222222222222",
    }),
  );
  r.headers.set("Content-Type", "application/json");
  assertEquals((await handler(r)).status, 404);
  globalThis.fetch = originalFetch;
});
