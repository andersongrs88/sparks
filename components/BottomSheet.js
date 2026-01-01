import { useEffect } from "react";

export default function BottomSheet({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    // lock scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="bsOverlay" role="dialog" aria-modal="true" aria-label={title || "Filtro"}>
      <div className="bsBackdrop" onClick={() => onClose?.()} />
      <div className="bsSheet">
        <div className="bsHeader">
          <div className="bsTitle">{title || "Filtros"}</div>
          <button className="btn sm ghost" onClick={() => onClose?.()} aria-label="Fechar">Fechar</button>
        </div>
        <div className="bsBody">{children}</div>
        {footer ? <div className="bsFooter">{footer}</div> : null}
      </div>
    </div>
  );
}
