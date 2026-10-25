import { useEffect, useState } from "react";
import { evidenceRead } from "../lib/evidence";
import type { Evidence } from "../lib/evidence";
import { dateLabel } from "../lib/dates";
import Dialog from "./Dialog";
// Bound simultaneous Google requests even when a job has many stops.
let running = 0;
const waiting: Array<() => void> = [];
async function readQueued(id: string, active: () => boolean) {
  await new Promise<void>((resolve) => {
    waiting.push(resolve);
    pump();
  });
  try {
    return active() ? await evidenceRead(id) : null;
  } finally {
    running--;
    pump();
  }
}
function pump() {
  while (running < 2 && waiting.length) {
    running++;
    waiting.shift()!();
  }
}
export default function EvidenceImage(
  { item, index }: { item: Evidence; index: number },
) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true, objectUrl = "";
    readQueued(item.id, () => live).then((blob) => {
      if (live && blob) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
    }).catch(() => {
      if (live) setError("โหลดภาพไม่สำเร็จ");
    });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id, attempt]);
  return (
    <figure className="evidence-thumb">
      {url
        ? (
          <button
            type="button"
            className="evidence-preview"
            aria-label={`ขยายภาพ ${index + 1}`}
            onClick={() => setOpen(true)}
          >
            <img src={url} alt={`ภาพแนบ ${index + 1}`} />
          </button>
        )
        : error
        ? (
          <div role="alert">
            {error}
            <button
              type="button"
              className="back"
              onClick={() => {
                setError("");
                setAttempt(attempt + 1);
              }}
            >
              ลองใหม่
            </button>
          </div>
        )
        : <div role="status">กำลังโหลดภาพ…</div>}
      <figcaption>
        {dateLabel(item.photo_date || item.created_at.slice(0, 10))}
      </figcaption>
      {open && (
        <Dialog title="รูปหลักฐาน" onClose={() => setOpen(false)}>
          <img className="evidence-image" src={url} alt="รูปหลักฐานการดำเนินการ" />
          <a
            className="secondary evidence-download"
            href={url}
            download={item.filename}
          >
            ดาวน์โหลดภาพ
          </a>
        </Dialog>
      )}
    </figure>
  );
}
