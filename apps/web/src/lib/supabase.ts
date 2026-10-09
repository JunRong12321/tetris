import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(url, anonKey, { realtime: { params: { eventsPerSecond: 20 } } })
  : createClient("https://placeholder.supabase.co", "placeholder-anon-key");
