export type PublicStop = {
  name: string;
  address: string;
  kind: string;
  contact: string;
  phone: string;
};
export type PublicPayload = {
  title: string;
  requester: string;
  requesterPhone: string;
  department: string;
  messengerId: string;
  stops: PublicStop[];
  website: string;
};
export type MessengerOption = { id: string; name: string };
export class IntakeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
const endpoint =
  import.meta.env.VITE_SUPABASE_URL + "/functions/v1/public-job-request";
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
  if (!response.ok)
    throw new IntakeError(
      data.message || "ไม่สามารถส่งคำขอได้",
      response.status,
    );
  return data;
}
export async function loadPublicMessengers(): Promise<MessengerOption[]> {
  const data = await request("GET");
  return data.messengers;
}
export async function submitPublicRequest(
  payload: PublicPayload,
  requestKey: string,
): Promise<{ code: string }> {
  return request("POST", { ...payload, requestKey });
}
