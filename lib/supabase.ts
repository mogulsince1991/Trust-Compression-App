import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://boswlaonbdxugkocquzv.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_DGHoaHgATffOCRCGOw9cDg_Y2hcL6cV";

let browserClient: ReturnType<typeof createClient> | null = null;

export function createBrowserSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (typeof window === "undefined") return createClient(supabaseUrl, supabaseAnonKey);
  if (!browserClient) browserClient = createClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
}

export function createPublicSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false
    }
  });
}

export function createServiceSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });
}

export function createUserSupabaseClient(accessToken: string) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}
