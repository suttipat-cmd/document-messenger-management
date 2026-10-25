export type PublicStop = {
  name: string;
  address: string;
  kind: string;
  contact: string;
  phone: string;
};
export type PublicPayload = {
  jobDate: string;
  title: string;
  requester: string;
  requesterPhone: string;
  department: string;
  messengerId: string;
  stops: PublicStop[];
  website: string;
  photoCounts?: number[];
};
export type MessengerOption = { id: string; name: string };
export class IntakeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
const endpoint = import.meta.env.VITE_SUPABASE_URL +
  "/functions/v1/public-job-request";
async function request(method: string, payload?: unknown) {
  const response = await fetch(endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new IntakeError(
      data.message || "ไม่สามารถส่งคำขอได้",
      response.status,
    );
  }
  return data;
}
export async function loadPublicMessengers(): Promise<MessengerOption[]> {
  const data = await request("GET");
  return data.messengers;
}
export async function submitPublicRequest(
  payload: PublicPayload,
  requestKey: string,
): Promise<
  {
    code: string;
    uploadToken?: string;
    stops?: { id: string; point: number }[];
  }
> {
  return request("POST", { ...payload, requestKey });
}

export async function uploadPublicPhoto(
  requestKey: string,
  token: string,
  stopId: string,
  slot: number,
  id: string,
  blob: Blob,
) {
  const form = new FormData();
  for (
    const [key, value] of Object.entries({
      action: "upload",
      requestKey,
      uploadToken: token,
      stopId,
      slot: String(slot),
      id,
    })
  ) form.set(key, value);
  form.set("file", blob, "assignment.jpg");
  await postPhoto(form);
}
export async function finishPublicPhotos(requestKey: string, token: string) {
  const form = new FormData();
  form.set("action", "finish");
  form.set("requestKey", requestKey);
  form.set("uploadToken", token);
  await postPhoto(form);
}
async function postPhoto(body: FormData) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body,
    signal: AbortSignal.timeout(70000),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new IntakeError(result.message || "บันทึกภาพไม่สำเร็จ", response.status);
  }
}
