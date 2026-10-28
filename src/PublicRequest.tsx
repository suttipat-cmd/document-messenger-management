import Field from "./ui/Field";
import Button from "./ui/Button";
import DraftPhotos from "./ui/DraftPhotos";
import type { DraftPhoto } from "./ui/DraftPhotos";
import ValidatedForm from "./ui/ValidatedForm";
import { Alert, Steps } from "./ui/Feedback";
import Required from "./Required";
import departments from "./data/departments.json";
import { dateLabel, today } from "./lib/dates";
import Loading from "./Loading";
import { useEffect, useRef, useState } from "react";
import {
  finishPublicPhotos,
  IntakeError,
  loadPublicMessengers,
  submitPublicRequest,
  uploadPublicPhoto,
} from "./lib/public-requests";
import type {
  MessengerOption,
  PublicPayload,
  PublicStop,
} from "./lib/public-requests";
const blankStop = (): PublicStop => ({
  name: "",
  address: "",
  kind: "รับเอกสาร",
  contact: "",
  phone: "",
});
const blank = (): PublicPayload => ({
  jobDate: today(),
  title: "",
  requester: "",
  requesterPhone: "",
  department: "",
  messengerId: "",
  stops: [blankStop()],
  website: "",
});
export default function PublicRequest() {
  const [form, setForm] = useState(blank);
  const [photos, setPhotos] = useState<DraftPhoto[][]>([[]]);
  const [photoBusy, setPhotoBusy] = useState(false),
    [progress, setProgress] = useState("");
  const photoRef = useRef(photos);
  useEffect(() => {
    photoRef.current = photos;
  }, [photos]);
  const created = useRef(false);
  useEffect(
    () => () =>
      photoRef.current.flat().forEach((p) => URL.revokeObjectURL(p.url)),
    [],
  );
  const patchPhotos = (i: number, items: DraftPhoto[]) =>
    setPhotos((current) => current.map((p, n) => n === i ? items : p));
  const [options, setOptions] = useState<MessengerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<string>();
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const lock = useRef(false);
  const attempted = useRef<PublicPayload | null>(null);
  const reload = () => {
    setLoading(true);
    setError("");
    void loadPublicMessengers()
      .then(setOptions)
      .catch(() => setError("โหลดรายชื่อผู้รับส่งเอกสาร ไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    let alive = true;
    void loadPublicMessengers()
      .then((data) => {
        if (alive) setOptions(data);
      })
      .catch(() => {
        if (alive) {
          setError("โหลดรายชื่อผู้รับส่งเอกสาร ไม่สำเร็จ กรุณาลองใหม่");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  const patchStop = (i: number, patch: Partial<PublicStop>) =>
    setForm({
      ...form,
      stops: form.stops.map((s, n) => (n === i ? { ...s, ...patch } : s)),
    });
  async function send() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const payload = attempted.current ||
      { ...structuredClone(form), photoCounts: photos.map((p) => p.length) };
    attempted.current = payload;
    try {
      const result = await submitPublicRequest(payload, requestKey);
      created.current = true;
      const total = photos.flat().length;
      if (total) {
        if (!result.uploadToken || !result.stops) throw Error("ไม่มีสิทธิ์แนบภาพ");
        let done = 0;
        for (let i = 0; i < photos.length; i++) {
          for (let n = 0; n < photos[i].length; n++) {
            const photo = photos[i][n];
            setProgress(`กำลังบันทึกภาพ ${done + 1}/${total} · ${result.code}`);
            await uploadPublicPhoto(
              requestKey,
              result.uploadToken,
              result.stops[i].id,
              n + 1,
              photo.id,
              photo.blob,
            );
            done++;
          }
        }
        await finishPublicPhotos(requestKey, result.uploadToken);
      }
      setReceipt(result.code);
      setUncertain(false);
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (e) {
      setError(
        e instanceof IntakeError
          ? e.message
          : "ยังยืนยันผลการส่งไม่ได้ กรุณากดส่งอีกครั้งเพื่อตรวจผลเดิม",
      );
      const retry = created.current || !(e instanceof IntakeError) ||
        e.status >= 500;
      setUncertain(retry);
      if (!retry) {
        attempted.current = null;
        setRequestKey(crypto.randomUUID());
      }
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const reset = () => {
    photos.flat().forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([[]]);
    created.current = false;
    setForm(blank());
    setRequestKey(crypto.randomUUID());
    attempted.current = null;
    setReceipt(undefined);
    setReview(false);
    setError("");
    setUncertain(false);
    reload();
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  return (
    <div className="public-app">
      <header className="public-header">
        <span className="brandmark">m↗</span>
        <div>
          <b>ระบบบริหารงานรับ/ส่งเอกสาร</b>
        </div>
        <a href="#/">เข้าสู่ระบบ</a>
      </header>
      <main className="public-main">
        <Steps current={receipt ? 2 : review ? 1 : 0} />
        {receipt
          ? (
            <section className="receipt">
              <span className="receipt-check">✓</span>
              <h1>ส่งงานเรียบร้อยแล้ว</h1>
              <p>เลขงานของคุณ</p>
              <strong>{receipt}</strong>
              <p>
                งานเข้ากองงานของ ผู้รับส่งเอกสารที่เลือกแล้ว
                กรุณาเก็บเลขงานนี้ไว้สำหรับติดต่อผู้รับผิดชอบ
              </p>
              <Button className="primary" onClick={reset}>
                สร้างงานใหม่
              </Button>
            </section>
          )
          : (
            <>
              <span className="eyebrow">ไม่ต้องสมัครสมาชิก</span>
              <h1>{review ? "ตรวจสอบก่อนส่ง" : "แบบฟอร์มมอบหมายงาน"}</h1>
              {error && <Alert tone="danger">{error}</Alert>}
              {review
                ? (
                  <>
                    <section className="panel">
                      <h2>{form.title}</h2>
                      <dl className="review-data">
                        <dt>วันที่</dt>
                        <dd>{dateLabel(form.jobDate)}</dd>
                        <dt>แผนก</dt>
                        <dd>{form.department}</dd>
                        <dt>ผู้มอบหมาย</dt>
                        <dd>{form.requester}</dd>
                        <dt>เบอร์ติดต่อ</dt>
                        <dd>{form.requesterPhone}</dd>

                        <dt>ผู้รับส่งเอกสาร</dt>
                        <dd>
                          {options.find((o) => o.id === form.messengerId)
                            ?.name ||
                            "รายชื่อที่เลือก"}
                        </dd>
                      </dl>
                    </section>
                    {form.stops.map((s, i) => (
                      <section className="panel" key={i}>
                        <span className="pill">
                          จุดที่ {i + 1} · {s.kind}
                        </span>
                        <h2>{s.name}</h2>
                        <p>{s.address}</p>
                        {s.contact && <p>ผู้ติดต่อ: {s.contact}</p>}
                        {s.phone && <p>โทร: {s.phone}</p>}
                        <DraftPhotos
                          photos={photos[i]}
                          onChange={(items) =>
                            patchPhotos(i, items)}
                          onBusy={setPhotoBusy}
                          readOnly
                          label={`ภาพจุดที่ ${i + 1}`}
                        />
                      </section>
                    ))}
                    {uncertain && (
                      <p className="auth-message">
                        ข้อมูลถูกล็อกชั่วคราวเพื่อป้องกันงานซ้ำ กดส่งอีกครั้งเพื่อตรวจคำขอเดิม
                      </p>
                    )}
                    <Button
                      className="primary"
                      disabled={busy}
                      onClick={() => void send()}
                    >
                      {busy
                        ? <Loading label={progress || "กำลังส่งงาน…"} />
                        : uncertain
                        ? (
                          "ตรวจผลการส่งอีกครั้ง"
                        )
                        : (
                          "ยืนยันส่งงาน"
                        )}
                    </Button>
                    <Button
                      className="secondary"
                      disabled={busy || uncertain}
                      onClick={() => {
                        setReview(false);
                        setError("");
                        window.scrollTo({ top: 0, behavior: "instant" });
                      }}
                    >
                      กลับไปแก้ไขข้อมูล
                    </Button>
                  </>
                )
                : (
                  <ValidatedForm
                    onInput={(e) => {
                      const field = e.target as HTMLInputElement;
                      if (field.validity?.valid) setError("");
                    }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (
                        !form.messengerId ||
                        !options.some((o) => o.id === form.messengerId)
                      ) {
                        setError("กรุณาเลือกผู้รับส่งเอกสาร ที่พร้อมรับงาน");
                        return;
                      }
                      setReview(true);
                      setError("");
                      window.scrollTo({ top: 0, behavior: "instant" });
                    }}
                  >
                    <fieldset disabled={photoBusy} className="intake-fields">
                      <section className="panel">
                        <h2>รายละเอียดงาน</h2>
                        <Field>
                          ชื่องาน <Required />
                          <input
                            required
                            maxLength={200}
                            value={form.title}
                            onChange={(e) =>
                              setForm({ ...form, title: e.target.value })}
                            placeholder="เช่น รับ–ส่งเอกสารฝ่ายบัญชี"
                          />
                        </Field>
                        <div className="public-fields">
                          <Field>
                            ชื่อผู้มอบหมาย <Required />
                            <input
                              required
                              autoComplete="name"
                              maxLength={120}
                              value={form.requester}
                              onChange={(e) =>
                                setForm({ ...form, requester: e.target.value })}
                            />
                          </Field>
                          <Field>
                            เบอร์ติดต่อผู้มอบหมาย
                            <input
                              type="tel"
                              autoComplete="tel"
                              maxLength={40}
                              value={form.requesterPhone}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  requesterPhone: e.target.value,
                                })}
                            />
                          </Field>
                        </div>
                        <Field>
                          แผนก <Required />
                          <select
                            required
                            value={form.department}
                            onChange={(e) =>
                              setForm({ ...form, department: e.target.value })}
                          >
                            <option value="">เลือกแผนก</option>
                            {departments.map((d) => <option key={d}>{d}
                            </option>)}
                          </select>
                        </Field>
                        <Field>
                          วันที่ <Required />
                          <input
                            type="date"
                            min="0001-01-01"
                            max="9999-12-31"
                            required
                            value={form.jobDate}
                            onChange={(e) =>
                              setForm({ ...form, jobDate: e.target.value })}
                          />
                        </Field>
                        <Field>
                          ผู้รับส่งเอกสาร <Required />
                          <select
                            required
                            disabled={loading || !options.length}
                            value={form.messengerId}
                            onChange={(e) =>
                              setForm({ ...form, messengerId: e.target.value })}
                          >
                            <option value="">
                              {loading ? "กำลังโหลดรายชื่อ…" : "เลือกผู้รับส่งเอกสาร"}
                            </option>
                            {options.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {!loading && !options.length && (
                          <p className="auth-message">
                            ยังไม่มีผู้รับส่งเอกสาร พร้อมรับงาน กรุณาติดต่อผู้ดูแลก่อนส่งงาน
                          </p>
                        )}
                        <Button
                          type="button"
                          className="back"
                          disabled={loading}
                          onClick={reload}
                        >
                          {loading ? <Loading label="กำลังโหลด…" /> : (
                            "โหลดรายชื่อใหม่"
                          )}
                        </Button>
                      </section>
                      <div className="section-title">
                        <h2>จุดรับ–ส่ง ({form.stops.length})</h2>
                        <span>เพิ่มได้สูงสุด 20 จุด</span>
                      </div>
                      {form.stops.map((s, i) => (
                        <section className="panel" key={i}>
                          <div className="row">
                            <h2>จุดที่ {i + 1}</h2>
                            {form.stops.length > 1 && (
                              <Button
                                type="button"
                                className="mode-button"
                                aria-label={`ลบจุดที่ ${i + 1}`}
                                onClick={() => {
                                  photos[i].forEach((p) =>
                                    URL.revokeObjectURL(p.url)
                                  );
                                  setPhotos(photos.filter((_, n) => n !== i));
                                  setForm({
                                    ...form,
                                    stops: form.stops.filter((_, n) =>
                                      n !== i
                                    ),
                                  });
                                }}
                              >
                                ลบจุด
                              </Button>
                            )}
                          </div>
                          <Field>
                            ประเภทจุดที่ {i + 1} <Required />
                            <select
                              required
                              value={s.kind}
                              onChange={(e) =>
                                patchStop(i, { kind: e.target.value })}
                            >
                              <option>รับเอกสาร</option>
                              <option>ส่งเอกสาร</option>
                            </select>
                          </Field>
                          <Field>
                            ชื่อสถานที่จุดที่ {i + 1} <Required />
                            <input
                              required
                              maxLength={200}
                              value={s.name}
                              onChange={(e) =>
                                patchStop(i, { name: e.target.value })}
                            />
                          </Field>
                          <Field>
                            ที่อยู่จุดที่ {i + 1}
                            <textarea
                              maxLength={1000}
                              rows={3}
                              value={s.address}
                              onChange={(e) =>
                                patchStop(i, { address: e.target.value })}
                            />
                          </Field>
                          <DraftPhotos
                            photos={photos[i]}
                            onChange={(items) => patchPhotos(i, items)}
                            onBusy={setPhotoBusy}
                            label={`ภาพจุดที่ ${i + 1}`}
                          />
                          <details className="optional-contact">
                            <summary>เพิ่มผู้ติดต่อที่จุดนี้ (ถ้ามี)</summary>
                            <Field>
                              ผู้ติดต่อจุดที่ {i + 1}
                              <input
                                maxLength={120}
                                value={s.contact}
                                onChange={(e) =>
                                  patchStop(i, { contact: e.target.value })}
                              />
                            </Field>
                            <Field>
                              เบอร์ติดต่อจุดที่ {i + 1}
                              <input
                                type="tel"
                                maxLength={40}
                                value={s.phone}
                                onChange={(e) =>
                                  patchStop(i, { phone: e.target.value })}
                              />
                            </Field>
                          </details>
                        </section>
                      ))}
                      <Button
                        type="button"
                        className="secondary"
                        disabled={form.stops.length >= 20}
                        onClick={() => {
                          setPhotos([...photos, []]);
                          setForm({
                            ...form,
                            stops: [
                              ...form.stops,
                              { ...blankStop(), kind: "ส่งเอกสาร" },
                            ],
                          });
                        }}
                      >
                        + เพิ่มจุดรับ–ส่ง
                      </Button>
                      <div className="honeypot" aria-hidden="true">
                        <label>
                          Website
                          <input
                            tabIndex={-1}
                            autoComplete="off"
                            value={form.website}
                            onChange={(e) =>
                              setForm({ ...form, website: e.target.value })}
                          />
                        </label>
                      </div>
                      <Button
                        className="primary"
                        disabled={loading || !options.length}
                      >
                        ตรวจสอบก่อนส่ง →
                      </Button>
                    </fieldset>
                  </ValidatedForm>
                )}
            </>
          )}
      </main>
    </div>
  );
}
