import { assertEquals } from "jsr:@std/assert@1.0.19";
let handler: (r: Request) => Promise<Response>;
const oldServe = Deno.serve;
Deno.serve = ((h: typeof handler) => {
  handler = h;
  return {};
}) as typeof Deno.serve;
await import("./index.ts");
Deno.serve = oldServe;
const oldFetch = globalThis.fetch;
Deno.env.set("SUPABASE_URL", "https://qa.supabase.co");
Deno.env.set(
  "SUPABASE_SECRET_KEYS",
  JSON.stringify({ default: "sb_secret_qa" }),
);
Deno.env.set("DRIVE_BRIDGE_SECRET", "qa-only-" + "a".repeat(64));
function request(
  body: FormData | string,
  origin = "https://suttipat-cmd.github.io",
) {
  return new Request("https://qa.supabase.co/functions/v1/public-job-request", {
    method: "POST",
    headers: {
      Origin: origin,
      ...(typeof body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body,
  });
}
Deno.test("public upload rejects a forged capability before touching the database or Google", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("Unexpected upstream");
  };
  try {
    const f = new FormData();
    f.set("action", "upload");
    f.set("requestKey", "11111111-1111-4111-8111-111111111111");
    f.set("uploadToken", "forged");
    const r = await handler(request(f));
    assertEquals(r.status, 403);
    assertEquals(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
Deno.test("public endpoint never offers a photo read operation", async () => {
  globalThis.fetch = async () => {
    throw Error("Unexpected upstream");
  };
  try {
    const r = await handler(
      request(
        JSON.stringify({
          action: "read",
          id: "11111111-1111-4111-8111-111111111111",
        }),
      ),
    );
    assertEquals(r.status, 422);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
Deno.test("public upload rejects unapproved origins", async () => {
  const f = new FormData();
  f.set("action", "upload");
  const r = await handler(request(f, "https://unapproved.example"));
  assertEquals(r.status, 403);
});
