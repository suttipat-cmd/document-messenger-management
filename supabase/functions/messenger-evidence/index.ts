import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const BRIDGE_URL =
  "https://script.google.com/macros/s/AKfycbzKWpCY72jBzvQvWlV0ldCFxxksFHe6NR073VwxkWsbVF1denaheKjiaI4BZnhxsHCV/exec";
const FOLDER = "11Iyc7T1iJdhRzUOmow_rIUx8bvu8om1O";
const MAX = 2 * 1024 * 1024;
const origins = new Set([
  "https://suttipat-cmd.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hex = (a: ArrayBuffer) =>
  Array.from(new Uint8Array(a), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
async function digest(a: Uint8Array) {
  return hex(await crypto.subtle.digest("SHA-256", new Uint8Array(a)));
}
async function hmac(a: string, secret: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(a)));
}
function same(a: string, b: unknown) {
  if (typeof b !== "string" || a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}
async function bounded(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw Error("EMPTY");
  const r = body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  while (true) {
    const x = await r.read();
    if (x.done) break;
    n += x.value.length;
    if (n > limit) {
      await r.cancel();
      throw Error("TOO_LARGE");
    }
    parts.push(x.value);
  }
  const b = new Uint8Array(n);
  let p = 0;
  for (const x of parts) {
    b.set(x, p);
    p += x.length;
  }
  return b;
}
function base64(b: Uint8Array) {
  let s = "";
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
}
async function bridge(data: Record<string, unknown>, secret: string) {
  const payload = JSON.stringify(data),
    nonce = crypto.randomUUID(),
    ts = Date.now();
  const signature = await hmac(
    "v1\n" + ts + "\n" + nonce + "\n" + payload,
    secret,
  );
  const response = await fetch(BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ v: 1, ts, nonce, payload, signature }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error("BRIDGE_UNAVAILABLE");
  const text = new TextDecoder().decode(
    await bounded(response.body, 3 * 1024 * 1024),
  );
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw Error("BRIDGE_UNAVAILABLE");
  }
  if (
    envelope.v !== 1 ||
    envelope.nonce !== nonce ||
    typeof envelope.payload !== "string" ||
    !same(
      await hmac("v1-response\n" + nonce + "\n" + envelope.payload, secret),
      envelope.signature,
    )
  )
    throw Error("BRIDGE_UNAVAILABLE");
  const result = JSON.parse(envelope.payload);
  if (!result.ok) throw Error(result.error || "BRIDGE_UNAVAILABLE");
  return result.data;
}
function imageType(b: Uint8Array) {
  if (
    b.length >= 4 &&
    b[0] === 255 &&
    b[1] === 216 &&
    b[2] === 255 &&
    b.at(-2) === 255 &&
    b.at(-1) === 217
  )
    return "image/jpeg";
  if (
    b.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
  )
    return "image/png";
  if (
    b.length >= 16 &&
    new TextDecoder().decode(b.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(b.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  return "";
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
  };
  if (origin && origins.has(origin))
    headers["Access-Control-Allow-Origin"] = origin;
  const reply = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers });
  if (origin && !origins.has(origin))
    return reply(403, { message: "ไม่อนุญาตเว็บไซต์นี้" });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (!["GET", "POST"].includes(req.method))
    return reply(405, { message: "ไม่รองรับคำขอนี้" });
  try {
    const url = Deno.env.get("SUPABASE_URL")!,
      keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"),
      pubs = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const key = keys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      pub = pubs.default || Deno.env.get("SUPABASE_ANON_KEY");
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer "))
      return reply(401, { message: "กรุณาเข้าสู่ระบบใหม่" });
    const caller = createClient(url, pub, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: identity, error: authError } = await caller.auth.getUser(
      auth.slice(7),
    );
    if (authError || !identity.user)
      return reply(401, { message: "กรุณาเข้าสู่ระบบใหม่" });
    const userId = identity.user.id;
    const { data: profile } = await caller
      .from("messenger_profiles")
      .select("role,active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.active)
      return reply(403, { message: "บัญชีนี้ยังไม่เปิดใช้งาน" });
    const secret = Deno.env.get("DRIVE_BRIDGE_SECRET") || "";
    if (req.method === "GET") {
      if (secret.length < 32) return reply(200, { ready: false });
      try {
        const health = await bridge({ action: "health" }, secret);
        return reply(200, { ready: health.ready === true, maxBytes: MAX });
      } catch {
        return reply(200, { ready: false });
      }
    }
    if (secret.length < 32)
      return reply(503, {
        message: "ระบบแนบภาพยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ",
      });
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ct = req.headers.get("content-type") || "";
    if (ct.startsWith("application/json")) {
      const input = JSON.parse(
        new TextDecoder().decode(await bounded(req.body, 4096)),
      );
      if (input.action !== "read" || !uuid.test(input.id || ""))
        return reply(422, { message: "ข้อมูลภาพไม่ถูกต้อง" });
      const { data: visible, error } = await caller
        .from("messenger_evidence")
        .select("id,mime_type,byte_size")
        .eq("id", input.id)
        .maybeSingle();
      if (error || !visible)
        return reply(404, { message: "ไม่พบภาพหรือไม่มีสิทธิ์ดูภาพนี้" });
      const { data: file, error: mappingError } = await admin.rpc(
        "messenger_evidence_file",
        { p_id: input.id },
      );
      if (mappingError || !file) return reply(404, { message: "ไม่พบภาพ" });
      const result = await bridge(
        { action: "read", fileId: file.drive_file_id, sha256: file.sha256 },
        secret,
      );
      if (
        typeof result.base64 !== "string" ||
        result.base64.length > Math.ceil(MAX / 3) * 4
      )
        throw Error("INVALID_IMAGE");
      const bytes = Uint8Array.from(atob(result.base64), (c) =>
        c.charCodeAt(0),
      );
      if (
        bytes.length !== visible.byte_size ||
        imageType(bytes) !== visible.mime_type ||
        (await digest(bytes)) !== file.sha256
      )
        throw Error("INVALID_IMAGE");
      const { data: stillVisible } = await caller
        .from("messenger_evidence")
        .select("id")
        .eq("id", input.id)
        .maybeSingle();
      if (!stillVisible)
        return reply(403, {
          message: "สิทธิ์เข้าถึงภาพเปลี่ยนแปลง กรุณาโหลดข้อมูลใหม่",
        });
      return new Response(bytes, {
        headers: {
          ...headers,
          "Content-Type": visible.mime_type,
          "Content-Disposition":
            'inline; filename="evidence.' +
            ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[
              visible.mime_type as string
            ] || "jpg") +
            '"',
        },
      });
    }
    if (!ct.startsWith("multipart/form-data"))
      return reply(415, { message: "รูปแบบข้อมูลไม่ถูกต้อง" });
    if (profile.role !== "messenger")
      return reply(403, { message: "เฉพาะผู้รับงานที่แนบภาพได้" });
    const bytes = await bounded(req.body, MAX + 65536);
    const form = await new Response(bytes, {
      headers: { "Content-Type": ct },
    }).formData();
    const id = String(form.get("id") || ""),
      jobId = String(form.get("jobId") || ""),
      stopId = String(form.get("stopId") || ""),
      purpose = String(form.get("purpose") || "");
    const file = form.get("file");
    if (
      !uuid.test(id) ||
      !uuid.test(jobId) ||
      !["stop", "return"].includes(purpose) ||
      (purpose === "stop" && !uuid.test(stopId)) ||
      (purpose === "return" && stopId) ||
      !(file instanceof File)
    )
      return reply(422, { message: "ข้อมูลภาพไม่ครบ" });
    const { data: job } = await caller
      .from("messenger_jobs")
      .select("id,messenger_id,status")
      .eq("id", jobId)
      .maybeSingle();
    if (!job || job.messenger_id !== userId)
      return reply(403, { message: "ไม่มีสิทธิ์แนบภาพในงานนี้" });
    const photo = new Uint8Array(await file.arrayBuffer()),
      mime = imageType(photo);
    if (!photo.length || photo.length > MAX || !mime || mime !== file.type)
      return reply(422, { message: "รองรับ JPEG, PNG และ WebP ไม่เกิน 2 MB" });
    const sha = await digest(photo),
      ext = (
        {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        } as Record<string, string>
      )[mime];
    const { data: reservation, error: reservedError } = await admin.rpc(
      "messenger_reserve_evidence",
      {
        p_id: id,
        p_actor: userId,
        p_job: jobId,
        p_stop: stopId || null,
        p_purpose: purpose,
        p_drive_id: "pending-" + id,
        p_folder: FOLDER,
        p_sha: sha,
        p_mime: mime,
        p_bytes: photo.length,
        p_name: "หลักฐาน-" + id + "." + ext,
      },
    );
    if (reservedError)
      return reply(reservedError.code === "42501" ? 403 : 409, {
        message:
          reservedError.code === "42501"
            ? "งานหรือจุดนี้ไม่อยู่ในสถานะที่แนบภาพได้"
            : "แนบได้สูงสุด 5 ภาพต่อจุด กรุณาโหลดข้อมูลใหม่หรือลองไฟล์เดิมอีกครั้ง",
      });
    if (!reservation.ready) {
      const uploaded = await bridge(
        {
          action: "upload",
          evidenceId: id,
          sha256: sha,
          mimeType: mime,
          base64: base64(photo),
        },
        secret,
      );
      if (
        uploaded.sha256 !== sha ||
        uploaded.byteSize !== photo.length ||
        uploaded.mimeType !== mime ||
        !uploaded.fileId
      )
        throw Error("INVALID_IMAGE");
      const { error: finalError } = await admin.rpc(
        "messenger_finalize_evidence",
        { p_id: id, p_actor: userId, p_drive_id: uploaded.fileId },
      );
      if (finalError)
        return reply(409, {
          message: "งานเปลี่ยนแปลงระหว่างแนบภาพ กรุณาโหลดข้อมูลใหม่",
        });
    }
    return reply(200, { id });
  } catch (e) {
    if (e instanceof Error && e.message === "TOO_LARGE")
      return reply(413, { message: "ภาพมีขนาดใหญ่เกินกำหนด" });
    // Never log authorization headers, image payloads, Google IDs or shared secrets.
    return reply(503, {
      message: "ยังยืนยันการแนบหรือโหลดภาพไม่ได้ กรุณาลองอีกครั้งด้วยไฟล์เดิม",
    });
  }
});
