import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";
const Evidence = lazy(() => import("./Evidence"));
export default function EvidenceBoundary(
  props: ComponentProps<typeof Evidence>,
) {
  return (
    <Suspense fallback={<p role="status">กำลังโหลดภาพ…</p>}>
      <Evidence
        key={[props.jobId, props.stopId, props.purpose, props.editable].join(
          ":",
        )}
        {...props}
      />
    </Suspense>
  );
}
