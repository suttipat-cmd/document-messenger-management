const paths: Record<string, string> = {
  jobs: "M4 5h16v16H4z M8 2v6 M16 2v6 M8 12h8 M8 16h5",
  stops:
    "M12 22s7-6 7-13a7 7 0 0 0-14 0c0 7 7 13 7 13z M12 6a3 3 0 1 0 0 6a3 3 0 0 0 0-6",
  history: "M3 12a9 9 0 1 0 3-7 M3 3v5h5 M12 7v6l4 2",
  account:
    "M20 21v-3a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v3 M12 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8",
  close: "M6 6l12 12 M18 6L6 18",
  refresh: "M20 7a9 9 0 1 0 1 9 M20 2v6h-6",
  check: "M5 12l4 4L20 5",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  info: "M12 11v6 M12 7h.01 M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20",
  warning: "M12 3L2 21h20z M12 9v5 M12 17h.01",
  camera: "M3 7h4l2-3h6l2 3h4v14H3z M12 10a4 4 0 1 0 0 8a4 4 0 0 0 0-8",
  chevron: "M9 5l7 7-7 7",
  back: "M15 5l-7 7 7 7",
  return: "M9 5L3 11l6 6 M3 11h11a6 6 0 0 1 6 6v4",
};
export default function Icon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  return (
    <svg
      className="ds-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.info} />
    </svg>
  );
}
