import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
if (key && !key.startsWith("sb_publishable_"))
  throw new Error("Only a modern publishable key is allowed in the frontend");
export const supabase = url && key ? createClient(url, key) : null;
