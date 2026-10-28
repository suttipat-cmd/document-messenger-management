import type { ComponentProps } from "react";

/** Keep native button semantics, refs and form submission behavior at every call site. */
export default function Button({ className = "", ...props }: ComponentProps<"button">) {
  return <button {...props} className={["ds-button", className].filter(Boolean).join(" ")} />;
}
