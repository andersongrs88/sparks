import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getNotificationSummary } from "../lib/notifications";

export default function NotificationsBell() {
  const { loading, user, profile, isFullAccess } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (loading || !user) return;
      try {
        const res = await getNotificationSummary({ user, profile, isFullAccess });
        if (!alive) return;
        setCount(res.total || 0);
      } catch (e) {
        // Evita quebrar layout por erro de rede/policy
        console.error(e);
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [loading, user?.id, profile?.role, isFullAccess]);

  if (!user) return null;

  return (
    <Link href="/notificacoes" className="iconBadge" aria-label={count > 0 ? `Notificações. ${count} novas.` : "Notificações"}>
      <span aria-hidden="true">🔔</span>
      {count > 0 ? <span className="badgeDot">{count > 99 ? "99+" : count}</span> : null}
    </Link>
  );
}
