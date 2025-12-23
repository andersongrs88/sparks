import { getProfileForLogin } from "./profiles";

const SESSION_KEY = "sparks.session";

// --- helpers ---
function safeJsonParse(v) {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function bufToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return bufToHex(hash);
}

export function getSession() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  return raw ? safeJsonParse(raw) : null;
}

export function setSession(session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

export function hasModule(session, moduleKey) {
  if (!session) return false;
  const mods = session.modules || [];
  return Array.isArray(mods) ? mods.includes(moduleKey) : false;
}

export function isLoggedIn() {
  return !!getSession();
}

export function logout() {
  clearSession();
}

// --- senha (MVP) ---
export function generatePasswordSuggestion(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*";
  let out = "";
  for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function hashPassword(password) {
  return sha256Hex(password);
}

/**
 * Login simples (MVP) usando a tabela `profiles`.
 *
 * Importante:
 * - Isso NÃO é Supabase Auth.
 * - Para uso interno e MVP. Para produção, o ideal é migrar para Supabase Auth.
 */
export async function loginWithEmailPassword(email, password) {
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("Informe seu e-mail.");
  if (!password) throw new Error("Informe sua senha.");

  const profile = await getProfileForLogin(cleanEmail);
  if (!profile) throw new Error("Usuário não encontrado.");
  if (!profile.is_active) throw new Error("Usuário inativo.");

  const typedHash = await sha256Hex(password);
  if (!profile.password_hash) throw new Error("Usuário sem senha cadastrada. Fale com o administrador.");
  if (typedHash !== profile.password_hash) throw new Error("Senha incorreta.");

  const session = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    modules: profile.modules || []
  };
  setSession(session);
  return session;
}
