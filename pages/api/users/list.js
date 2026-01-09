import { createClient } from "@supabase/supabase-js";

// Public (authenticated) route used by dropdowns to list active users.
// It validates the caller's access token, then uses the Service Role key
// to bypass RLS for the profiles list.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getBearerToken(req) {
  const h = req.headers?.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Missing Supabase env vars" });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Missing Authorization token" });

    // Validate token
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user?.id) return res.status(401).json({ error: "Invalid session" });

    // Ensure the caller is an active profile (any role).
    const { data: me, error: meErr } = await admin
      .from("profiles")
      .select("id,is_active")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (meErr) throw meErr;
    if (!me?.is_active) return res.status(403).json({ error: "Inactive user" });

    const { data, error } = await admin
      .from("profiles")
      .select("id,name,email,role,is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw error;

    return res.status(200).json({ users: data ?? [] });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
}
