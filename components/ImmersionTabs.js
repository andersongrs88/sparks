export default function ImmersionTabs({ tabs, active, onChange }) {
  return (
    <div className="tabRow">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={active === t.key ? "tabBtn active" : "tabBtn"}
          onClick={() => onChange(t.key)}
        >
          <span className="tabLabelWrap">
            {t.label}
            {typeof t.badge !== "undefined" && t.badge !== null && t.badge !== "" ? (
              <span className="tabBadge" aria-label={`Pendências: ${t.badge}`}>{t.badge}</span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
