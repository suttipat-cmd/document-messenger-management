import Field from "./Field";
import Button from "./Button";
import { useEffect, useRef, useState } from "react";
import {
  evidenceList,
  evidenceReady,
  evidenceUpload,
  prepareImage,
} from "../lib/evidence";
import type { Evidence } from "../lib/evidence";
import Required from "../Required";
import EvidenceImage from "./EvidenceImage";
import { today } from "../lib/dates";
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
  const [photoDate, setPhotoDate] = useState(today);
  const pendingDate = useRef("");
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
  async function upload(source: File | Blob) {
    if (!jobId || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const blob = source instanceof File ? await prepareImage(source) : source;
      if (source instanceof File) pendingDate.current = photoDate;
      if (alive.current) setPending(blob);
      await evidenceUpload(jobId, stopId, purpose, blob, pendingDate.current);
      const data = await evidenceList(jobId, stopId, purpose);
      if (alive.current) {
        setItems(data);
        setPending(null);
        setSuccess("บันทึกภาพแล้ว");
      }
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "แนบภาพไม่สำเร็จ");
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const pick = (file?: File) => {
    if (file) void upload(file);
  };
  if (!jobId) {
    return (
      <div className="photo-box">
        <Button className="camera" disabled>
          <Icon name="camera" />
          แนบรูปหลักฐาน
        </Button>
      </div>
    );
  }
  return (
    <div className="evidence-panel" aria-label="รูปหลักฐาน">
      {loading ? <p role="status">กำลังโหลดภาพ…</p> : (
        <>
          {editable && ready &&
            items.filter((x) => x.purpose !== "assignment").length < 5 &&
            (
              <>
                <Field>
                  วันที่แนบภาพ <Required />
                  <input
                    type="date"
                    required
                    min="0001-01-01"
                    max="9999-12-31"
                    value={photoDate}
                    disabled={busy || !!pending}
                    onChange={(e) => setPhotoDate(e.target.value)}
                  />
                </Field>
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
                  <Button
                    type="button"
                    className="secondary"
                    disabled={busy || !photoDate}
                    onClick={() => camera.current?.click()}
                  >
                    <Icon name="camera" size={18} />
                    ถ่ายรูป
                  </Button>
                  <Button
                    type="button"
                    className="secondary"
                    disabled={busy || !photoDate}
                    onClick={() => picker.current?.click()}
                  >
                    เลือกภาพ
                  </Button>
                </div>
              </>
            )}
          {editable && !ready && !error && (
            <p className="hint">
              ระบบแนบภาพยังไม่พร้อม{" "}
              <Button
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
              </Button>
            </p>
          )}
          {!items.length && !editable && !error && (
            <p className="hint">ยังไม่มีรูปหลักฐาน</p>
          )}
          {(["assignment", "rider"] as const).map((group) => {
            const photos = items.filter((item) =>
              group === "assignment"
                ? item.purpose === "assignment"
                : item.purpose !== "assignment"
            );
            return photos.length > 0 && (
              <section key={group} className="evidence-group">
                <h4>{group === "assignment" ? "ภาพผู้มอบหมาย" : "ภาพผู้รับส่ง"}</h4>
                <div className="evidence-gallery">
                  {photos.map((item, i) => (
                    <EvidenceImage key={item.id} item={item} index={i} />
                  ))}
                </div>
              </section>
            );
          })}
          {editable && ready && (
            <small>
              {items.filter((x) => x.purpose !== "assignment").length}/5 ภาพ ·
              ย่อภาพก่อนบันทึก
            </small>
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
            <Button
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
            </Button>
          )}
          {pending && (
            <Button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void upload(pending)}
            >
              ลองบันทึกภาพเดิมอีกครั้ง
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
