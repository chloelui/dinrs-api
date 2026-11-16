import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const options = { auth: { autoRefreshToken: false, persistSession: false } };

// Full-power client for reading/writing tables and verifying tokens
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, options);

// Brand-new client per login/signup call
export function newAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
}