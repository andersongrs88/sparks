import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { updateMyAuth, updateMyProfile } from "../lib/profiles";

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="h2">{label}</div>
      {hint ? (
        <div className="small" style={{ marginBottom: 6 }}>
          {hint}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export default function ContaPage() {
  const router = useRouter();
  const { loading: authLoading, user, profile } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      return;
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    setName(profile?.name || "");
    setEmail(profile?.email || user?.email || "");
  }, [profile?.name, profile?.email, user?.email]);

  const hasChanges = useMemo(() => {
    const baseName = (profile?.name || "").trim();
    const baseEmail = (profile?.email || user?.email || "").trim();
    return name.trim() !== baseName || email.trim() !== baseEmail || !!pwd;
  }, [name, email, pwd, profile?.name, profile?.email, user?.email]);

  async function onSave(e) {
    e.preventDefault();
    if (!user) return;

    setError("");
    setOkMsg("");

    const n = name.trim();
    const em = email.trim();

    if (!n) {
      setError("Preencha o nome.");
      return;
    }

    if (pwd) {
      if (pwd.length < 8) {
        setError("A senha deve ter pelo menos 8 caracteres.");
        return;
      }
      if (pwd !== pwd2) {
        setError("As senhas não conferem.");
        return;
      }
    }

    try {
      setBusy(true);

      // 1) Atualiza profile (nome/email local)
      await updateMyProfile({ name: n, email: em || null });

      // 2) Atualiza Auth (email/senha)
      // Observação: dependendo das configurações do Supabase, o email pode exigir confirmação.
      await updateMyAuth({ email: em || undefined, password: pwd || undefined });

      setPwd("");
      setPwd2("");
      setOkMsg(
        "Dados atualizados. Se você alterou o e-mail, o Supabase pode exigir confirmação no novo endereço."
      );
    } catch (e2) {
      setError(e2?.message || "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Minha conta">
      <form className="card" onSubmit={onSave}>
        <div className="h2">Minha conta</div>
        <div className="small" style={{ marginBottom: 12 }}>
          Atualize seu nome, e-mail e senha.
        </div>

        {error ? (
          <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>
            {error}
          </div>
        ) : null}
        {okMsg ? (
          <div className="small" style={{ color: "var(--success)", marginBottom: 12 }}>
            {okMsg}
          </div>
        ) : null}

        <Field label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field
          label="E-mail"
          hint="Se a confirmação de e-mail estiver ativada no Supabase, você precisará confirmar o novo e-mail."
        >
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>

        <Field label="Alterar senha" hint="Opcional: mínimo 8 caracteres.">
          <div className="grid2">
            <input
              className="input"
              type="password"
              placeholder="Nova senha"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Confirmar nova senha"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
            />
          </div>
        </Field>

        <div className="row">
          <button type="button" className="btn" onClick={() => router.back()} disabled={busy}>
            Voltar
          </button>
          <button type="submit" className="btn primary" disabled={busy || !hasChanges}>
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Layout>
  );
}
