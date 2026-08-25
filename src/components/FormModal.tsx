import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";

type FormModalProps = {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending?: boolean;
  submitLabel?: string;
  feedback?: ReactNode;
};

export function FormModal({
  eyebrow = "Cadastro",
  title,
  children,
  onClose,
  onSubmit,
  pending = false,
  submitLabel = "Salvar",
  feedback
}: FormModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const pendingRef = useRef(pending);

  useEffect(() => { closeRef.current = onClose; pendingRef.current = pending; }, [onClose, pending]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      ".modal-body input:not([disabled]), .modal-body select:not([disabled]), .modal-body textarea:not([disabled])"
    );
    focusable?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) closeRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return <div className="modal-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !pending) onClose();
  }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={pending} ref={dialogRef}>
      <header className="modal-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Fechar janela" onClick={onClose} disabled={pending}><X/></button>
      </header>
      <form className="modal-form" onSubmit={onSubmit}>
        <div className="modal-body">{children}{feedback}</div>
        <footer className="modal-footer">
          <button type="button" className="button ghost" onClick={onClose} disabled={pending}>Cancelar</button>
          <button className="button primary" disabled={pending}>{pending ? "Salvando…" : submitLabel}</button>
        </footer>
      </form>
    </section>
  </div>;
}
