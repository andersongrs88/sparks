import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // precisa existir na Vercel
);

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < 10; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Informe o e-mail." });
    }

    // 1) busca usuário
    const { data: user, error } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "E-mail não encontrado." });
    }

    // 2) gera nova senha
    const newPassword = generateTempPassword();
    const hash = await bcrypt.hash(newPassword, 12);

    // 3) salva hash
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ password_hash: hash })
      .eq("id", user.id);

    if (updErr) {
      return res.status(500).json({ error: "Erro ao atualizar senha." });
    }

    // 4) retorna senha temporária (MVP)
    return res.status(200).json({
      ok: true,
      tempPassword: newPassword
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro inesperado." });
  }
}
