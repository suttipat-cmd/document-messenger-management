import type { ComponentProps } from "react";

/** A shared label keeps required markers and inline validation attached to the control. */
export default function Field({ className = "", ...props }: ComponentProps<"label">) {
  return <label {...props} className={["field", className].filter(Boolean).join(" ")} />;
}
