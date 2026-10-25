import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const BRIDGE_URL =
  "https://script.google.com/macros/s/AKfycbzKWpCY72jBzvQvWlV0ldCFxxksFHe6NR073VwxkWsbVF1denaheKjiaI4BZnhxsHCV/exec";
const MAX = 2 * 1024 * 1024;
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
  for (let i = 0; i < b.length; i += 8192) {
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  }
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
  ) {
    throw Error("BRIDGE_UNAVAILABLE");
  }
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
  ) {
    return "image/jpeg";
  }
  if (
    b.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
  ) {
    return "image/png";
  }
  if (
    b.length >= 16 &&
    new TextDecoder().decode(b.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(b.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return "";
}

const intakeOrigins = new Set([
  "https://suttipat-cmd.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && intakeOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  headers["Access-Control-Allow-Headers"] = "content-type, apikey";
  const reply = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers });
  if (origin && !intakeOrigins.has(origin)) {
    return reply(403, { message: "ไม่อนุญาตเว็บไซต์นี้" });
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (!["GET", "POST"].includes(req.method)) {
    return reply(405, { message: "ไม่รองรับคำขอนี้" });
  }
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const secrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const key = secrets.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      return reply(503, { message: "ระบบยังไม่พร้อม กรุณาลองใหม่ภายหลัง" });
    }
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (req.method === "GET") {
      const { data, error } = await admin.rpc("messenger_intake_options");
      if (error) {
        return reply(503, { message: "โหลดรายชื่อ ผู้รับส่งเอกสาร ไม่สำเร็จ" });
      }
      return reply(200, { messengers: data });
    }
    const secret = Deno.env.get("DRIVE_BRIDGE_SECRET") || "";
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (secret.length < 32) {
        return reply(503, { message: "ระบบแนบภาพยังไม่พร้อม" });
      }
      const form = await new Response(await bounded(req.body, MAX + 65536), {
        headers: { "Content-Type": req.headers.get("content-type")! },
      }).formData();
      const requestKey = String(form.get("requestKey") || ""),
        token = String(form.get("uploadToken") || ""),
        action = String(form.get("action") || "");
      if (
        !uuid.test(requestKey) ||
        !same(await hmac("intake-photo:" + requestKey, secret), token)
      ) return reply(403, { message: "ไม่มีสิทธิ์แนบภาพในคำขอนี้" });
      if (action === "finish") {
        const { error } = await admin.rpc("messenger_finish_intake_photos", {
          p_key: requestKey,
        });
        return error
          ? reply(409, { message: "ยังบันทึกภาพไม่ครบ กรุณาลองส่งอีกครั้ง" })
          : reply(200, { ok: true });
      }
      const id = String(form.get("id") || ""),
        stopId = String(form.get("stopId") || ""),
        slot = Number(form.get("slot")),
        file = form.get("file");
      if (
        action !== "upload" || !uuid.test(id) || !uuid.test(stopId) ||
        !Number.isInteger(slot) || slot < 1 || slot > 5 ||
        !(file instanceof File)
      ) return reply(422, { message: "ข้อมูลภาพไม่ครบ" });
      const photo = new Uint8Array(await file.arrayBuffer()),
        mime = imageType(photo);
      if (!photo.length || photo.length > MAX || !mime || mime !== file.type) {
        return reply(422, { message: "รองรับ JPEG, PNG และ WebP ไม่เกิน 2 MB" });
      }
      const sha = await digest(photo);
      const { data: r, error } = await admin.rpc(
        "messenger_reserve_intake_photo",
        {
          p_key: requestKey,
          p_id: id,
          p_stop: stopId,
          p_slot: slot,
          p_sha: sha,
          p_mime: mime,
          p_bytes: photo.length,
        },
      );
      if (error) {
        return reply(409, {
          message: "ไม่สามารถแนบภาพได้ กรุณาตรวจคำขอและจำนวนภาพ",
        });
      }
      if (!r.ready) {
        const receipt = await bridge({
          action: "upload",
          layoutVersion: 2,
          evidenceId: id,
          sha256: sha,
          mimeType: mime,
          base64: base64(photo),
          jobDate: r.job_date,
          jobCode: r.job_code,
          pointNumber: r.point_number,
          imageNumber: r.image_number,
          source: "assignment",
        }, secret);
        if (
          receipt.sha256 !== sha || receipt.byteSize !== photo.length ||
          receipt.mimeType !== mime || !receipt.fileId
        ) throw Error("INVALID_IMAGE");
        const { error: finalError } = await admin.rpc(
          "messenger_finalize_intake_photo",
          { p_key: requestKey, p_id: id, p_drive_id: receipt.fileId },
        );
        if (finalError) {
          return reply(409, { message: "ยังยืนยันภาพไม่ได้ กรุณาลองส่งอีกครั้ง" });
        }
      }
      return reply(200, { id });
    }
    if (!req.headers.get("content-type")?.startsWith("application/json")) {
      return reply(415, { message: "รูปแบบข้อมูลไม่ถูกต้อง" });
    }
    const reader = req.body?.getReader();
    if (!reader) return reply(400, { message: "ไม่พบข้อมูล" });
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        return reply(413, { message: "ข้อมูลยาวเกินกำหนด กรุณาลดรายละเอียด" });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return reply(400, { message: "รูปแบบข้อมูลไม่ถูกต้อง" });
    }
    if (!body || Array.isArray(body) || typeof body !== "object") {
      return reply(400, { message: "รูปแบบข้อมูลไม่ถูกต้อง" });
    }
    if (body.website) return reply(400, { message: "ไม่สามารถรับคำขอได้" });
    const {
      requestKey,
      jobDate,
      title,
      requester,
      requesterPhone,
      department,
      messengerId,
      stops,
      photoCounts,
    } = body;
    if (
      typeof requestKey !== "string" || !uuid.test(requestKey) ||
      typeof messengerId !== "string" || !uuid.test(messengerId)
    ) return reply(422, { message: "กรุณาเลือก ผู้รับส่งเอกสาร และตรวจข้อมูลอีกครั้ง" });
    const address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    // Never store raw IP addresses or forward client Authorization headers.
    const bucketDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(key + ":" + address),
    );
    const bucket = Array.from(
      new Uint8Array(bucketDigest),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    const { data, error } = await admin.rpc("messenger_intake_submit", {
      p_key: requestKey,
      p_payload: {
        jobDate,
        title,
        requester,
        requesterPhone,
        department,
        messengerId,
        stops,
        ...(photoCounts ? { photoCounts } : {}),
      },
      p_bucket: bucket,
    });
    if (error) {
      if (error.code === "P0429") {
        return reply(429, { message: "มีการส่งงานจำนวนมาก กรุณาลองใหม่อีกสักครู่" });
      }
      if (error.code === "P0409") {
        return reply(409, {
          message: "คำขอนี้ถูกใช้แล้ว กรุณารีเฟรชฟอร์มก่อนเริ่มงานใหม่",
        });
      }
      if (error.code === "P0404") {
        return reply(422, {
          message: "ผู้รับส่งเอกสาร คนนี้ยังไม่พร้อมรับงาน กรุณาโหลดรายชื่อใหม่",
        });
      }
      if (error.code?.startsWith("22") || error.code?.startsWith("23")) {
        return reply(422, {
          message: "ข้อมูลไม่ครบหรือยาวเกินกำหนด กรุณาตรวจทุกจุดรับ–ส่ง",
        });
      }
      return reply(503, { message: "ยังยืนยันผลไม่ได้ กรุณากดส่งอีกครั้งด้วยข้อมูลเดิม" });
    }
    if (
      photoCounts && Array.isArray(photoCounts) &&
      photoCounts.some((n) => Number(n) > 0)
    ) {
      if (secret.length < 32) {
        return reply(503, {
          message: "สร้างงานแล้ว แต่ระบบภาพยังไม่พร้อม กรุณาส่งอีกครั้งด้วยข้อมูลเดิม",
        });
      }
      const { data: context, error: contextError } = await admin.rpc(
        "messenger_intake_photo_context",
        { p_key: requestKey },
      );
      if (contextError || !context) throw Error("NO_CONTEXT");
      return reply(200, {
        ...data,
        uploadToken: await hmac("intake-photo:" + requestKey, secret),
        stops: context.stops,
      });
    }
    return reply(200, data);
  } catch {
    return reply(503, { message: "ยังยืนยันผลไม่ได้ กรุณากดส่งอีกครั้งด้วยข้อมูลเดิม" });
  }
});
