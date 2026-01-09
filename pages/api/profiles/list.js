import { createClient } from "@supabase/supabase-js";

const bearer = (req) => {
  const h = req.headers?.authorization || "";
  const m = h.match(/^Bearer\\s+(.+)$/i);
  return m ? m[1] : null;
};

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") { res.setHeader("Allow","GET"); return res.status(405).json({ error: "Method not allowed" }); }
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: "Missing Authorization Bearer token" });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return res.status(500).json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY" });
    const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: udata, error: uerr } = await caller.auth.getUser();
    if (uerr || !udata?.user) return res.status(401).json({ error: "Invalid session" });
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const db = service ? createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }) : caller;
    const role = (req.query?.role || "").toString().trim();
    let q = db.from("profiles").select("id,name,email,role,is_active").eq("is_active", true).order("name", { ascending: true });
    if (role) q = q.eq("role", role);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ profiles: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
}
