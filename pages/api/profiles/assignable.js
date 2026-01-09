import { createClient } from '@supabase/supabase-js';

function getBearer(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return res.status(500).json({ error: 'Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)' });
  }

  const token = getBearer(req);
  if (!token) return res.status(401).json({ error: 'Missing Authorization token' });

  // Use the caller token (RLS-aware). The DB migration provides a SECURITY DEFINER RPC
  // so that non-admin roles can still list ACTIVE users for assignment.
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  // Prefer RPC (recommended). If it doesn't exist, fall back to direct select
  // and rely on your RLS policy.
  let data, error;

  try {
    const rpc = await supabase.rpc('list_assignable_profiles');
    data = rpc.data;
    error = rpc.error;
  } catch (e) {
    // ignore and fallback
    error = null;
    data = null;
  }

  if (error) {
    return res.status(500).json({ error: error.message || String(error) });
  }

  if (!data) {
    const q = await supabase
      .from('profiles')
      .select('id,name,email,role,is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (q.error) return res.status(500).json({ error: q.error.message });
    data = q.data;
  }

  return res.status(200).json({ profiles: data || [] });
}
