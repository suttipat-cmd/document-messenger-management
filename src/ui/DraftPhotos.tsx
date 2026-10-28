import Button from "./Button";
import { useEffect, useRef, useState } from "react";
import { prepareImage } from "../lib/evidence";
export type DraftPhoto = { id: string; blob: Blob; url: string };
export default function DraftPhotos({
  photos,
  onChange,
  onBusy,
  readOnly = false,
  label,
}: {
  photos: DraftPhoto[];
  onChange: (photos: DraftPhoto[]) => void;
  onBusy: (busy: boolean) => void;
  readOnly?: boolean;
  label: string;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function add(files: FileList | null) {
    if (!files || lock.current) return;
    if (photos.length + files.length > 5) {
      setError("แนบได้ไม่เกิน 5 ภาพต่อจุด");
      return;
    }
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    const added: DraftPhoto[] = [];
    try {
      for (const file of Array.from(files)) {
        const blob = await prepareImage(file);
        added.push({
          id: crypto.randomUUID(),
          blob,
          url: URL.createObjectURL(blob),
        });
      }
      if (live.current) onChange([...photos, ...added]);
      else added.forEach((p) => URL.revokeObjectURL(p.url));
    } catch (e) {
      added.forEach((p) => URL.revokeObjectURL(p.url));
      setError(e instanceof Error ? e.message : "เตรียมภาพไม่สำเร็จ");
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="evidence-draft">
      <h3>
        {label} <small>({photos.length}/5)</small>
      </h3>
      <div className="evidence-gallery">
        {photos.map((p, i) => (
          <figure className="evidence-thumb" key={p.id}>
            <div className="evidence-preview">
              <img src={p.url} alt={`ภาพแนบ ${i + 1}`} />
            </div>
            {!readOnly && (
              <Button
                type="button"
                className="back"
                disabled={busy}
                onClick={() => {
                  URL.revokeObjectURL(p.url);
                  onChange(photos.filter((x) => x.id !== p.id));
                }}
              >
                ลบภาพ {i + 1}
              </Button>
            )}
          </figure>
        ))}
      </div>
      {!readOnly && (
        <>
          <input
            ref={input}
            aria-label={label}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            className="secondary"
            disabled={busy || photos.length >= 5}
            onClick={() => input.current?.click()}
          >
            เลือกภาพ
          </Button>
        </>
      )}
      {busy && <p role="status">กำลังเตรียมภาพ…</p>}
      {error && <p role="alert" className="evidence-error">{error}</p>}
    </div>
  );
}
