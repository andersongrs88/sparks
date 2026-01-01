import { hasFullAccess } from "./permissions";

const KEY = "sparks_session";

// MVP: logins fake (até migrar para Supabase Auth)
// Senha padrão do MVP: 123456
// Contas com acesso total (permissões):
// - admin@sparks.com (admin)
// - educacao@sparks.com (consultor_educacao)
// - designer@sparks.com (designer)
const MVP_USERS = {
  "admin@sparks.com": { role: "admin" },
  "educacao@sparks.com": { role: "consultor_educacao" },
  "designer@sparks.com": { role: "designer" }
};

export function getSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function login(email, password) {
  // MVP: login fake
  const user = MVP_USERS[email];
  if (user && password === "123456") {
    const session = { email, role: user.role, ts: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(session));
    return { ok: true };
  }
  return { ok: false, message: "Credenciais inválidas." };
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function requireAuth(router) {
  const s = getSession();
  if (!s) {
    router.replace("/login");
    return null;
  }
  return s;
}

export function requireFullAccess(router) {
  const s = requireAuth(router);
  if (!s) return null;
  if (!hasFullAccess(s)) {
    router.replace("/dashboard");
    return null;
  }
  return s;
}
