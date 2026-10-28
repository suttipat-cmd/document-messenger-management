import Button from "./Button";
import { useEffect } from "react";
import type { ReactNode } from "react";
import Icon from "./Icon";
export function Alert({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  return (
    <div
      className={"ds-alert " + tone}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon
        name={
          tone === "success" ? "check" : tone === "warning" ? "warning" : "info"
        }
      />
      <div>{children}</div>
    </div>
  );
}
export function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  return (
    <div className="ds-toast">
      <Alert tone="success">{message}</Alert>
      <Button aria-label="ปิดการแจ้งเตือน" onClick={onClose}>
        <Icon name="close" size={18} />
      </Button>
    </div>
  );
}
export function Skeleton({
  label = "กำลังโหลดพื้นที่ทำงาน",
}: {
  label?: string;
}) {
  return (
    <section className="ds-skeleton" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="skeleton-line title" />
      <div className="skeleton-cards">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} />
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div className="skeleton-line" key={i} />
      ))}
    </section>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ds-empty">
      <Icon name="jobs" size={32} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Steps({ current }: { current: number }) {
  return (
    <ol className="ds-steps" aria-label="ขั้นตอนมอบหมายงาน">
      {["กรอกข้อมูล", "ตรวจสอบ", "สำเร็จ"].map((label, i) => (
        <li
          key={label}
          className={i === current ? "current" : i < current ? "complete" : ""}
          aria-current={i === current ? "step" : undefined}
        >
          <span>{i < current ? <Icon name="check" size={14} /> : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
