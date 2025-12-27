import { getNotificationSummary } from "./notifications";

// Browser notifications (Notification API)
// Opt-in only; no push (fires only while app is open).

const ENABLE_KEY = "browser_notifications_enabled";
const LAST_STATE_KEY = "browser_notifications_last_state";

export function isBrowserNotificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserNotificationPermission() {
  if (!isBrowserNotificationsSupported()) return "unsupported";
  return Notification.permission; // default|denied|granted
}

export function isBrowserNotificationsEnabled() {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(ENABLE_KEY) === "1"; } catch { return false; }
}

export function setBrowserNotificationsEnabled(enabled) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ENABLE_KEY, enabled ? "1" : "0"); } catch {}
}

export async function requestBrowserNotificationPermission() {
  if (!isBrowserNotificationsSupported()) return "unsupported";
  try { return await Notification.requestPermission(); } catch { return "default"; }
}

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

function readLastState() {
  if (typeof window === "undefined") return null;
  try { return safeParse(window.sessionStorage.getItem(LAST_STATE_KEY)) || null; } catch { return null; }
}

function writeLastState(state) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(LAST_STATE_KEY, JSON.stringify(state)); } catch {}
}

function buildBody(summary) {
  const items = (summary?.items || []).slice(0, 3);
  if (items.length === 0) return "Sem itens agora.";
  const lines = items.map((t) => `• ${t.title}`).join("\n");
  const extra = (summary.total || 0) - items.length;
  return extra > 0 ? `${lines}\n+${extra} item(ns)` : lines;
}

function fireNotification({ title, body, url }) {
  if (!isBrowserNotificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body });
    n.onclick = () => {
      try { window.focus(); } catch {}
      try { window.location.href = url; } catch {}
    };
  } catch {}
}

export async function pollAndNotify({ user, profile, isFullAccess }) {
  if (typeof window === "undefined") return;
  if (!isBrowserNotificationsEnabled()) return;
  if (!isBrowserNotificationsSupported()) return;
  if (Notification.permission !== "granted") return;

  const summary = await getNotificationSummary({ user, profile, isFullAccess });
  const last = readLastState();

  const nextState = {
    total: Number(summary?.total || 0),
    overdue: Number(summary?.overdue || 0),
    today: Number(summary?.today || 0),
    soon: Number(summary?.soon || 0),
    ts: Date.now(),
  };

  if (!last) {
    writeLastState(nextState);
    return;
  }

  const becameWorse = nextState.overdue > last.overdue || nextState.today > last.today || nextState.total > last.total;
  if (becameWorse && nextState.total > 0) {
    const title =
      nextState.overdue > 0
        ? `Sparks: ${nextState.overdue} tarefa(s) atrasada(s)`
        : nextState.today > 0
          ? `Sparks: ${nextState.today} tarefa(s) vencem hoje`
          : `Sparks: ${nextState.total} pendências nos próximos dias`;

    fireNotification({ title, body: buildBody(summary), url: "/notificacoes" });
  }

  writeLastState(nextState);
}
