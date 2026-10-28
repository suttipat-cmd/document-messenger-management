import Button from "./Button";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import Icon from "./Icon";
export default function Dialog({
  title,
  children,
  onClose,
  busy = false,
  sheet = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  sheet?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    const before = document.activeElement as HTMLElement | null;
    if (d?.showModal) d.showModal();
    else d?.setAttribute("open", "");
    return () => {
      if (d && typeof d.showModal === "function") d.close();
      else d?.removeAttribute("open");
      before?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      aria-modal="true"
      className={"ds-dialog " + (sheet ? "ds-sheet" : "")}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <Button
          type="button"
          disabled={busy}
          className="ds-icon-button"
          aria-label="ปิดหน้าต่าง"
          onClick={onClose}
        >
          <Icon name="close" />
        </Button>
      </header>
      {children}
    </dialog>
  );
}
