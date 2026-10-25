import { supabase } from "./supabase";
export type Evidence = {
  id: string;
  job_id: string;
  stop_id: string | null;
  purpose: "stop" | "return" | "assignment";
  photo_date?: string | null;
  filename: string;
  mime_type: string;
  byte_size: number;
  created_at: string;
};
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export async function evidenceList(
  jobId: string,
  stopId: string | undefined,
  purpose: "stop" | "return",
) {
  if (!supabase) throw Error("กรุณาเข้าสู่ระบบใหม่");
  let q = supabase
    .from("messenger_evidence")
    .select(
      "id,job_id,stop_id,purpose,filename,mime_type,byte_size,created_at,photo_date",
    )
    .eq("job_id", jobId)
    .in("purpose", purpose === "stop" ? ["stop", "assignment"] : [purpose])
    .order("created_at")
    .order("id");
  q = stopId ? q.eq("stop_id", stopId) : q.is("stop_id", null);
  const { data, error } = await q;
  if (error) throw Error("โหลดรายการภาพไม่สำเร็จ");
  return data as Evidence[];
}
async function call(
  body?: FormData | Record<string, string>,
  method: "GET" | "POST" = "POST",
) {
  if (!supabase) throw Error("กรุณาเข้าสู่ระบบใหม่");
  const { data, error } = await supabase.functions.invoke(
    "messenger-evidence",
    { method, body },
  );
  if (error) {
    let message = "เชื่อมต่อภาพไม่สำเร็จ กรุณาลองอีกครั้ง";
    try {
      const json = await error.context?.json();
      if (json?.message) message = json.message;
    } catch {
      /* no JSON response */
    }
    throw Error(message);
  }
  return data;
}
export async function evidenceReady() {
  const data = await call(undefined, "GET");
  return data?.ready === true;
}
export async function prepareImage(file: File): Promise<Blob> {
  if (!file.size || file.size > 20 * 1024 * 1024) {
    throw Error("เลือกภาพขนาดไม่เกิน 20 MB");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Error("เปิดภาพนี้ไม่ได้ กรุณาใช้ JPEG, PNG หรือ WebP");
  }
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 48000000
    ) {
      throw Error("ความละเอียดภาพสูงเกินไป");
    }
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("อุปกรณ์นี้ไม่รองรับการเตรียมภาพ");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("เตรียมภาพไม่สำเร็จ"))),
        "image/jpeg",
        0.85,
      )
    );
    if (blob.size > MAX_IMAGE_BYTES) {
      throw Error("ภาพยังใหญ่เกิน 2 MB กรุณาเลือกภาพอื่น");
    }
    return blob;
  } finally {
    bitmap.close();
  }
}
export async function evidenceUpload(
  jobId: string,
  stopId: string | undefined,
  purpose: "stop" | "return",
  blob: Blob,
  photoDate?: string,
) {
  const bytes = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const sha = Array.from(
    new Uint8Array(hash),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  // Stable request ID lets the same prepared file resume after a lost response.
  const key = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(jobId + ":" + (stopId || "return") + ":" + sha),
  );
  const v = Array.from(
    new Uint8Array(key),
    (x) => x.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 32);
  const id = `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${
    v.slice(16, 20)
  }-${v.slice(20)}`;
  const form = new FormData();
  form.set("id", id);
  form.set("jobId", jobId);
  form.set("purpose", purpose);
  if (stopId) form.set("stopId", stopId);
  if (photoDate) form.set("photoDate", photoDate);
  form.set("file", blob, "evidence.jpg");
  return call(form);
}
export async function evidenceRead(id: string): Promise<Blob> {
  if (!supabase) throw Error("กรุณาเข้าสู่ระบบใหม่");
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session) throw Error("กรุณาเข้าสู่ระบบใหม่");
  // functions.invoke treats image/* as text; fetch binary bytes explicitly.
  const response = await fetch(
    import.meta.env.VITE_SUPABASE_URL + "/functions/v1/messenger-evidence",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify({ action: "read", id }),
      signal: AbortSignal.timeout(70000),
    },
  );
  if (!response.ok) {
    let message = "โหลดภาพไม่สำเร็จ";
    try {
      const body = await response.json();
      if (body.message) message = body.message;
    } catch {
      /* generic failure */
    }
    throw Error(message);
  }
  const blob = await response.blob();
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(blob.type) ||
    blob.size > MAX_IMAGE_BYTES
  ) {
    throw Error("โหลดภาพไม่สำเร็จ");
  }
  return blob;
}
