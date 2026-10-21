export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function dateLabel(value?: string) {
  return value
    ? new Intl.DateTimeFormat("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value + "T00:00:00Z"))
    : "—";
}
