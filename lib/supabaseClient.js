import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Evita crash no build se as envs estiverem vazias/erradas
export const supabase =
  url && anon ? createClient(url, anon) : null;
