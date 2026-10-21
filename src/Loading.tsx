export default function Loading({ label = "กำลังโหลด…" }: { label?: string }) {
  return (
    <span className="loading-state" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  );
}
