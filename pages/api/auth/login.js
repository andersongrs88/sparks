import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnon);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Informe e-mail e senha." });
    }

    const { data: user, error } = await supabase
      .from("profiles")
      .select("id, name, email, role, is_active, modules, password_hash")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: "Usuário inativo." });
    }

    if (!user.password_hash) {
      return res.status(403).json({ error: "Usuário sem senha cadastrada. Use 'Esqueci minha senha'." });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    }

    // MVP simples: salva sessão no cookie/localStorage você já deve ter no front.
    // Aqui devolvemos um payload básico.
    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        modules: user.modules || []
      }
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno no login." });
  }
}
