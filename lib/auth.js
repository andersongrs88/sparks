const KEY = "sparks_session";

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
  // Credenciais:
  // email: admin@sparks.com
  // senha: 123456
  if (email === "admin@sparks.com" && password === "123456") {
    const session = { email, role: "admin", ts: Date.now() };
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
