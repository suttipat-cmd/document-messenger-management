import { useId, useRef, useState } from "react";
import type { FormHTMLAttributes, FormEvent } from "react";
import { createPortal } from "react-dom";
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Failure = {
  field: Field;
  label: HTMLLabelElement;
  message: string;
  id: string;
};
export default function ValidatedForm(
  props: FormHTMLAttributes<HTMLFormElement>,
) {
  const prefix = useId();
  const sequence = useRef(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const invalid = (e: FormEvent<HTMLFormElement>) => {
    const field = e.target as Field;
    if (!("validity" in field)) return;
    field.setCustomValidity("");
    const label = field.closest("label");
    if (!label) return;
    const name =
      Array.from(label.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join("")
        .trim() || "ข้อมูล";
    const message = field.validity.valueMissing
      ? "กรุณาระบุ" + name
      : field.type === "email"
        ? "รูปแบบอีเมลไม่ถูกต้อง"
        : "กรุณาตรวจสอบ" + name;
    field.setCustomValidity(message);
    field.setAttribute("aria-invalid", "true");
    const id =
      field.getAttribute("aria-errormessage") ||
      prefix + "-error-" + ++sequence.current;
    field.setAttribute("aria-errormessage", id);
    field.setAttribute("aria-describedby", id);
    setFailures((old) => [
      ...old.filter((f) => f.field !== field),
      { field, label, message, id },
    ]);
  };
  const edited = (e: FormEvent<HTMLFormElement>) => {
    const field = e.target as Field;
    if (!field.getAttribute || field.getAttribute("aria-invalid") !== "true")
      return;
    field.setCustomValidity("");
    if (field.validity.valid) {
      field.removeAttribute("aria-invalid");
      field.removeAttribute("aria-errormessage");
      field.removeAttribute("aria-describedby");
      setFailures((old) => old.filter((f) => f.field !== field));
    }
  };
  return (
    <>
      <form
        {...props}
        noValidate
        onSubmit={(e) => {
          if (!e.currentTarget.checkValidity()) {
            e.preventDefault();
            e.currentTarget
              .querySelector<HTMLElement>('[aria-invalid="true"]')
              ?.focus();
            return;
          }
          props.onSubmit?.(e);
        }}
        onInvalidCapture={(e) => {
          invalid(e);
          props.onInvalidCapture?.(e);
        }}
        onInputCapture={(e) => {
          edited(e);
          props.onInputCapture?.(e);
        }}
        onChangeCapture={(e) => {
          edited(e);
          props.onChangeCapture?.(e);
        }}
      />
      {failures
        .filter((f) => f.label.isConnected)
        .map((f) =>
          createPortal(
            <span className="field-error" id={f.id} aria-live="polite">
              {f.message}
            </span>,
            f.label,
            f.id,
          ),
        )}
    </>
  );
}
