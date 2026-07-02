import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente con service_role: SOLO usar en código de servidor (route handlers,
// server actions). Nunca importar desde un componente "use client".
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
