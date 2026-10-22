import { supabase } from "./supabase";
import type { Job } from "../App";
export type Profile = {
  id: string;
  email?: string;
  display_name: string;
  role: "admin" | "super_user" | "messenger";
  active: boolean;
};
export type Snapshot = {
  jobs: Job[];
  order: string[];
  profile: Profile | null;
  messengers: Profile[];
  profiles: Profile[];
};
export type Action =
  | "accept"
  | "complete_stop"
  | "retry_stop"
  | "start_return"
  | "confirm_return";
type DbJob = {
  id: string;
  code: string;
  title: string;
  requester: string;
  requester_phone: string;
  job_date: string;
  messenger_id: string;
  department: string;
  status: Job["status"];
  return_reason: string | null;
  returned_at: string | null;
  completed_at: string | null;
  version: number;
  created_at: string;
};
type DbStop = {
  id: string;
  job_id: string;
  name: string;
  address: string;
  kind: string;
  contact: string;
  phone: string;
  status: "pending" | "retry" | "done";
  route_position: number;
  note: string;
};
type DbEvent = { job_id: string; message: string; created_at: string };
// Explicit paging avoids silent truncation at the Data API's row limit.
async function readAll<T>(table: string, columns = "*"): Promise<T[]> {
  if (!supabase) throw new Error("Supabase configuration missing");
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase
      .from(table)
      .select(columns)
      .order("id")
      .range(offset, offset + 499);
    if (result.error) throw result.error;
    const batch = result.data as unknown as T[];
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}
export async function loadWorkspace(userId: string): Promise<Snapshot> {
  if (!supabase) throw new Error("Supabase configuration missing");
  const p = await supabase
    .from("messenger_profiles")
    .select("id,email,display_name,role,active")
    .eq("id", userId)
    .maybeSingle();
  if (p.error) throw p.error;
  const profile = p.data as Profile | null;
  if (!profile?.active)
    return { profile, jobs: [], order: [], messengers: [], profiles: [] };
  const [dbJobs, dbStops, events, profiles] = await Promise.all([
    readAll<DbJob>("messenger_jobs"),
    readAll<DbStop>("messenger_stops"),
    readAll<DbEvent>("messenger_events", "id,job_id,message,created_at"),
    readAll<Profile>("messenger_profiles", "id,email,display_name,role,active"),
  ]);
  const stops = dbStops.sort(
    (a, b) => a.route_position - b.route_position || a.id.localeCompare(b.id),
  );
  return {
    profile,
    order: stops.map((s) => s.id),
    profiles,
    messengers: profiles.filter((p) => p.active && p.role === "messenger"),
    jobs: dbJobs
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((j) => ({
        id: j.code,
        dbId: j.id,
        version: j.version,
        title: j.title,
        person: j.requester,
        requesterPhone: j.requester_phone,
        jobDate: j.job_date,
        messengerId: j.messenger_id,
        messengerName: profiles.find((p) => p.id === j.messenger_id)
          ?.display_name,
        department: j.department,
        status: j.status,
        returnReason: j.return_reason || undefined,
        returned: !!j.returned_at,
        completedAt: j.completed_at || undefined,
        stops: stops
          .filter((s) => s.job_id === j.id)
          .map((s) => ({
            id: s.id,
            name: s.name,
            address: s.address,
            kind: s.kind,
            contact: s.contact,
            phone: s.phone,
            status: s.status,
            note: s.note,
          })),
        events: events
          .filter((e) => e.job_id === j.id)
          .map((e) => ({ text: e.message, time: e.created_at })),
      })),
  };
}
export async function command(
  job: Job,
  action: Action,
  stopId?: string,
  note = "",
) {
  if (!supabase || !job.dbId) throw new Error("Supabase job missing");
  const r = await supabase.rpc("messenger_command", {
    p_job_id: job.dbId,
    p_action: action,
    p_stop_id: stopId || null,
    p_note: note,
    p_expected_version: job.version,
  });
  if (r.error) throw r.error;
}
export async function reorder(ids: string[]) {
  if (!supabase) throw new Error("Supabase configuration missing");
  const r = await supabase.rpc("messenger_reorder", { p_stop_ids: ids });
  if (r.error) throw r.error;
}
export function errorText(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (code === "40001")
    return "งานมีการเปลี่ยนแปลงจากอีกหน้าจอ กรุณารีเฟรชแล้วลองอีกครั้ง";
  if (code === "42501")
    return "ไม่มีสิทธิ์ดำเนินการ หรือบัญชีถูกระงับ กรุณาติดต่อผู้ดูแลระบบ";
  return "เชื่อมต่อหรือบันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

export async function setProfile(profile: Profile) {
  if (!supabase) throw new Error("Supabase configuration missing");
  const r = await supabase.rpc("messenger_set_profile", {
    p_user_id: profile.id,
    p_role: profile.role,
    p_active: profile.active,
    p_name: profile.display_name,
  });
  if (r.error) throw r.error;
}
