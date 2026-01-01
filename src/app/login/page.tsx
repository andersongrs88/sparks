"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import ThemeToggle from "@/components/ThemeToggle";
import Footer from "@/components/Footer";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/app");
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao autenticar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh">
      <main className="container-page py-10">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Acesse o StartB</h1>
              <p className="muted mt-1 text-sm">Entre com seu e-mail e senha.</p>
            </div>
            <ThemeToggle />
          </div>

          <form onSubmit={onSubmit} className="card mt-6 p-6">
            <label className="label" htmlFor="email">E-mail</label>
            <input
              id="email"
              className="input mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />

            <label className="label mt-4" htmlFor="password">Senha</label>
            <input
              id="password"
              className="input mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />

            {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p>}

            <button className="btn mt-5 w-full" disabled={loading} type="submit">
              {loading ? "Entrando…" : "Entrar"}
            </button>

            <p className="muted mt-4 text-xs">
              Dica: crie o usuário no Supabase Auth e depois faça login aqui.
            </p>
          </form>

          <Footer />
        </div>
      </main>
    </div>
  );
}
