import { useState } from "react";
import type { ReactNode } from "react";
import type { Job } from "./App";
import type { Action } from "./lib/workspace";
import type { Snapshot } from "./lib/workspace";
import Loading from "./Loading";
type Command = (
  job: Job,
  action: Action,
  stopId?: string,
  note?: string,
) => Promise<unknown>;
const labels = {
  new: "รอรับงาน",
  active: "กำลังดำเนินการ",
  returning: "กำลังคืนเอกสาร",
  done: "เสร็จสิ้น",
};
export default function Manager({
  onCommand,
  snapshot,
  users,
  busy,
  onCreate,
  onRefresh,
  onLogout,
}: {
  onCommand: Command;
  snapshot: Snapshot;
  users: ReactNode;
  busy: boolean;
  onCreate: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState("jobs");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string>();
  const jobs = snapshot.jobs.filter(
    (j) =>
      (status === "all" || j.status === status) &&
      [j.id, j.title, j.person, j.messengerName, j.department]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const job = snapshot.jobs.find((j) => j.id === selected);
  return (
    <div className="management-shell">
      <aside className="management-sidebar">
        <a className="management-brand" href="#/">
          m↗ <b>Messenger</b>
        </a>
        <nav aria-label="เมนูจัดการ">
          <button
            className={tab === "jobs" ? "selected" : ""}
            onClick={() => setTab("jobs")}
          >
            ▦ งานทั้งหมด <span>{snapshot.jobs.length}</span>
          </button>
          {snapshot.profile?.role === "admin" && (
            <button
              className={tab === "users" ? "selected" : ""}
              onClick={() => setTab("users")}
            >
              ♙ บัญชีผู้ใช้
            </button>
          )}
          <a href="#/request">↗ ฟอร์มสร้างงาน</a>
        </nav>
        <div className="management-account">
          <b>{snapshot.profile?.display_name}</b>
          <small>
            {snapshot.profile?.role === "admin" ? "Admin" : "Super User"}
          </small>
          <button disabled={busy} onClick={onLogout}>
            ออกจากระบบ
          </button>
        </div>
      </aside>
      <main className="management-main">
        <header className="management-topbar">
          <div>
            <span className="eyebrow">WORKSPACE</span>
            <h1>{tab === "users" ? "บัญชีผู้ใช้" : "งานรับ–ส่งเอกสาร"}</h1>
          </div>
          <div className="management-actions">
            <button className="secondary" disabled={busy} onClick={onRefresh}>
              {busy ? <Loading /> : "↻ รีเฟรช"}
            </button>
            <button className="primary" disabled={busy} onClick={onCreate}>
              + สร้างงาน
            </button>
          </div>
        </header>
        {tab === "users" ? (
          <section className="management-users">{users}</section>
        ) : (
          <>
            <div className="management-stats">
              {(["new", "active", "returning", "done"] as const).map((s) => (
                <button
                  key={s}
                  className={status === s ? "selected" : ""}
                  onClick={() => setStatus(status === s ? "all" : s)}
                >
                  <span>{labels[s]}</span>
                  <strong>
                    {snapshot.jobs.filter((j) => j.status === s).length}
                  </strong>
                </button>
              ))}
            </div>
            <section className="management-list">
              <div className="management-toolbar">
                <input
                  aria-label="ค้นหางาน"
                  placeholder="ค้นหาเลขงาน ชื่องาน ผู้มอบหมาย…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="สถานะงาน"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">ทุกสถานะ</option>
                  {Object.entries(labels).map(([s, l]) => (
                    <option key={s} value={s}>
                      {l}
                    </option>
                  ))}
                </select>
                <span>{jobs.length} งาน</span>
              </div>
              <div
                className="management-table"
                role="table"
                aria-label="งานทั้งหมด"
              >
                <div className="management-row table-heading" role="row">
                  <span>เลขงาน / ชื่องาน</span>
                  <span>ผู้มอบหมาย</span>
                  <span>Messenger</span>
                  <span>สถานะ</span>
                  <span>ความคืบหน้า</span>
                </div>
                {jobs.map((j) => (
                  <button
                    key={j.id}
                    className={
                      "management-row " + (selected === j.id ? "selected" : "")
                    }
                    onClick={() => setSelected(j.id)}
                  >
                    <span>
                      <small className="code">{j.id}</small>
                      <b>{j.title}</b>
                    </span>
                    <span>
                      {j.person}
                      <small>{j.department}</small>
                    </span>
                    <span>{j.messengerName || "—"}</span>
                    <span>
                      <i className={"status-tag " + j.status}>
                        {labels[j.status]}
                      </i>
                    </span>
                    <span>
                      {j.stops.filter((s) => s.status === "done").length}/
                      {j.stops.length} จุด
                      <progress
                        value={
                          j.stops.filter((s) => s.status === "done").length
                        }
                        max={j.stops.length || 1}
                      />
                    </span>
                  </button>
                ))}
              </div>
              {!jobs.length && <div className="management-empty">ไม่พบงาน</div>}
            </section>
          </>
        )}
      </main>
      {job && tab === "jobs" && (
        <JobPanel
          key={job.id}
          busy={busy}
          onCommand={onCommand}
          job={job}
          onClose={() => setSelected(undefined)}
        />
      )}
    </div>
  );
}
function JobPanel({
  job,
  onClose,
  busy,
  onCommand,
}: {
  job: Job;
  busy: boolean;
  onCommand: Command;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  async function run(action: Action, stopId?: string) {
    try {
      await onCommand(job, action, stopId, note);
      setNote("");
    } catch {
      /* workspace error */
    }
  }
  return (
    <aside className="management-detail" aria-label="รายละเอียดงาน">
      <header>
        <span className="code">{job.id}</span>
        <button aria-label="ปิดรายละเอียด" onClick={onClose}>
          ×
        </button>
      </header>
      <h2>{job.title}</h2>
      <span className={"status-tag " + job.status}>{labels[job.status]}</span>
      <dl>
        <dt>ผู้มอบหมาย</dt>
        <dd>{job.person}</dd>
        {job.requesterPhone && (
          <>
            <dt>เบอร์ติดต่อ</dt>
            <dd>
              <a href={"tel:" + job.requesterPhone}>{job.requesterPhone}</a>
            </dd>
          </>
        )}
        <dt>Messenger</dt>
        <dd>{job.messengerName || "—"}</dd>
      </dl>
      {job.status === "new" && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => void run("accept")}
        >
          {busy ? <Loading label="กำลังบันทึก…" /> : "รับงาน"}
        </button>
      )}
      {(job.status === "active" || job.status === "returning") && (
        <div className="management-command">
          <label className="field">
            หมายเหตุ / เหตุผล
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              disabled={busy}
            />
          </label>
          {job.status === "active" ? (
            <button
              className="secondary"
              disabled={busy || !note.trim()}
              onClick={() => void run("start_return")}
            >
              นำเอกสารกลับคืน
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void run("confirm_return")}
            >
              ยืนยันคืนเอกสารแล้ว
            </button>
          )}
        </div>
      )}
      <h3>จุดรับ–ส่ง</h3>
      {job.stops.map((s, i) => (
        <section className="management-stop" key={s.id}>
          <small>
            {i + 1} · {s.kind} ·{" "}
            {s.status === "done"
              ? "สำเร็จ"
              : s.status === "retry"
                ? "รอทำใหม่"
                : "รอดำเนินการ"}
          </small>
          <b>{s.name}</b>
          <p>{s.address}</p>
          {s.contact && (
            <p>
              {s.contact} {s.phone && <a href={"tel:" + s.phone}>{s.phone}</a>}
            </p>
          )}
          {s.note && <p>{s.note}</p>}
          {job.status === "active" && s.status !== "done" && (
            <div className="management-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void run("complete_stop", s.id)}
              >
                สำเร็จ
              </button>
              <button
                className="secondary"
                disabled={busy || !note.trim()}
                onClick={() => void run("retry_stop", s.id)}
              >
                รอทำใหม่
              </button>
            </div>
          )}
        </section>
      ))}
      {job.returnReason && <p>เหตุผลคืนเอกสาร: {job.returnReason}</p>}
      <h3>ประวัติ</h3>
      <ol className="management-timeline">
        {job.events?.map((e, i) => (
          <li key={i}>
            <p>{e.text}</p>
            <small>{new Date(e.time).toLocaleString("th-TH")}</small>
          </li>
        ))}
      </ol>
    </aside>
  );
}
