import { useEffect, useRef, useState } from "react";
import {
  evidenceList,
  evidenceReady,
  evidenceRead,
  evidenceUpload,
  prepareImage,
} from "../lib/evidence";
import type { Evidence } from "../lib/evidence";
import Dialog from "./Dialog";
import Icon from "./Icon";
export default function EvidencePanel({
  jobId,
  stopId,
  purpose = "stop",
  editable = false,
  revision,
  onBusy,
}: {
  revision?: number;
  jobId?: string;
  stopId?: string;
  purpose?: "stop" | "return";
  editable?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const [items, setItems] = useState<Evidence[]>([]),
    [loading, setLoading] = useState(!!jobId),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [view, setView] = useState<Evidence | null>(null),
    [viewUrl, setViewUrl] = useState(""),
    [viewError, setViewError] = useState("");
  const [pending, setPending] = useState<Blob | null>(null);
  const camera = useRef<HTMLInputElement>(null),
    picker = useRef<HTMLInputElement>(null),
    lock = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    onBusy?.(busy);
    return () => onBusy?.(false);
  }, [busy, onBusy]);
  useEffect(() => {
    let live = true;
    if (!jobId) return;
    Promise.all([
      evidenceList(jobId, stopId, purpose),
      editable ? evidenceReady() : Promise.resolve(false),
    ])
      .then(([data, available]) => {
        if (live) {
          setItems(data);
          setReady(available);
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "โหลดภาพไม่สำเร็จ");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [jobId, stopId, purpose, editable, revision]);
  useEffect(() => {
    let live = true,
      url = "";
    if (view)
      evidenceRead(view.id)
        .then((blob) => {
          if (live) {
            url = URL.createObjectURL(blob);
            setViewUrl(url);
          }
        })
        .catch((e) => {
          if (live)
            setViewError(e instanceof Error ? e.message : "โหลดภาพไม่สำเร็จ");
        });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [view]);
  async function upload(source: File | Blob) {
    if (!jobId || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const blob = source instanceof File ? await prepareImage(source) : source;
      if (alive.current) setPending(blob);
      await evidenceUpload(jobId, stopId, purpose, blob);
      const data = await evidenceList(jobId, stopId, purpose);
      if (alive.current) {
        setItems(data);
        setPending(null);
        setSuccess("บันทึกภาพแล้ว");
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "แนบภาพไม่สำเร็จ");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const pick = (file?: File) => {
    if (file) void upload(file);
  };
  if (!jobId)
    return (
      <div className="photo-box">
        <button className="camera" disabled>
          <Icon name="camera" />
          แนบรูปหลักฐาน
        </button>
      </div>
    );
  return (
    <div className="evidence-panel" aria-label="รูปหลักฐาน">
      {loading ? (
        <p role="status">กำลังโหลดภาพ…</p>
      ) : (
        <>
          {editable && ready && items.length < 5 && (
            <div className="evidence-actions">
              <input
                ref={camera}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                aria-label="ถ่ายภาพหลักฐาน"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <input
                ref={picker}
                type="file"
                accept="image/*"
                hidden
                aria-label="เลือกภาพหลักฐาน"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => camera.current?.click()}
              >
                <Icon name="camera" size={18} />
                ถ่ายรูป
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => picker.current?.click()}
              >
                เลือกภาพ
              </button>
            </div>
          )}
          {editable && !ready && !error && (
            <p className="hint">
              ระบบแนบภาพยังไม่พร้อม{" "}
              <button
                type="button"
                className="back"
                disabled={busy}
                onClick={() => {
                  setError("");
                  void evidenceReady()
                    .then(setReady)
                    .catch(() => setError("เชื่อมต่อภาพไม่สำเร็จ"));
                }}
              >
                ตรวจสอบอีกครั้ง
              </button>
            </p>
          )}
          {!items.length && !editable && !error && (
            <p className="hint">ยังไม่มีรูปหลักฐาน</p>
          )}
          {items.length > 0 && (
            <div className="evidence-gallery">
              {items.map((item, i) => (
                <button
                  type="button"
                  className="evidence-item"
                  key={item.id}
                  disabled={busy}
                  onClick={() => {
                    setViewUrl("");
                    setViewError("");
                    setView(item);
                  }}
                >
                  <Icon name="camera" size={20} />
                  <span>ดูภาพ {i + 1}</span>
                </button>
              ))}
            </div>
          )}
          {editable && ready && (
            <small>{items.length}/5 ภาพ · ย่อภาพก่อนบันทึก</small>
          )}
        </>
      )}
      {busy && <p role="status">กำลังเตรียมและบันทึกภาพ…</p>}
      {success && (
        <p role="status" className="evidence-success">
          {success}
        </p>
      )}
      {error && (
        <div className="evidence-error" role="alert">
          {error}
          {!pending && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void Promise.all([
                  evidenceList(jobId, stopId, purpose),
                  editable ? evidenceReady() : Promise.resolve(false),
                ])
                  .then(([data, available]) => {
                    setItems(data);
                    setReady(available);
                    setError("");
                  })
                  .catch(() => setError("โหลดภาพไม่สำเร็จ กรุณาลองอีกครั้ง"))
                  .finally(() => setBusy(false));
              }}
            >
              โหลดรายการภาพใหม่
            </button>
          )}
          {pending && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void upload(pending)}
            >
              ลองบันทึกภาพเดิมอีกครั้ง
            </button>
          )}
        </div>
      )}
      {view && (
        <Dialog title="รูปหลักฐาน" onClose={() => setView(null)}>
          {viewUrl ? (
            <>
              <img
                className="evidence-image"
                src={viewUrl}
                alt="รูปหลักฐานการดำเนินการ"
              />
              <a
                className="secondary evidence-download"
                href={viewUrl}
                download={view.filename}
              >
                ดาวน์โหลดภาพ
              </a>
            </>
          ) : viewError ? (
            <p role="alert">{viewError}</p>
          ) : (
            <p role="status">กำลังโหลดภาพ…</p>
          )}
        </Dialog>
      )}
    </div>
  );
}
