import { useState } from "react";
import type { ReactNode } from "react";
import type { Job } from "./App";
import type { Action } from "./lib/workspace";
import type { Snapshot } from "./lib/workspace";
import { dateLabel, today } from "./lib/dates";
import Icon from "./ui/Icon";
import { EmptyState } from "./ui/Feedback";
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
  onRefresh,
  onLogout,
}: {
  onCommand: Command;
  snapshot: Snapshot;
  users: ReactNode;
  busy: boolean;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState("jobs");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [department, setDepartment] = useState("all");
  const [messenger, setMessenger] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const invalidDates = !!from && !!to && from > to;
  const departments = Array.from(
    new Set(snapshot.jobs.map((j) => j.department)),
  ).sort(new Intl.Collator("th").compare);
  const messengers = Array.from(
    new Map(
      snapshot.jobs.map((j) => [
        j.messengerId || j.messengerName || "",
        j.messengerName || "ไม่ระบุผู้รับงาน",
      ]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], "th"));
  const filtered =
    search.trim() !== "" ||
    status !== "all" ||
    department !== "all" ||
    messenger !== "all" ||
    !!from ||
    !!to;
  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setDepartment("all");
    setMessenger("all");
    setFrom("");
    setTo("");
    setSelected(undefined);
  };
  const [pageSize, setPageSize] = useState(10);
  const [paging, setPaging] = useState({ key: "", page: 1 });
  const [selected, setSelected] = useState<string>();
  const jobs = snapshot.jobs.filter(
    (j) =>
      !invalidDates &&
      (status === "all" || j.status === status) &&
      (department === "all" || (j.department || "__blank") === department) &&
      (messenger === "all" ||
        (j.messengerId || j.messengerName || "__blank") === messenger) &&
      (!from || (!!j.jobDate && j.jobDate >= from)) &&
      (!to || (!!j.jobDate && j.jobDate <= to)) &&
      [j.id, j.title, j.person, j.messengerName, j.department]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const pageKey = JSON.stringify([
    search,
    status,
    department,
    messenger,
    from,
    to,
    pageSize,
  ]);
  const pageCount = Math.max(1, Math.ceil(jobs.length / pageSize));
  const page = paging.key === pageKey ? Math.min(paging.page, pageCount) : 1;
  const pageStart = (page - 1) * pageSize;
  const visibleJobs = jobs.slice(pageStart, pageStart + pageSize);
  const goPage = (n: number) =>
    setPaging({ key: pageKey, page: Math.max(1, Math.min(n, pageCount)) });
  const chips = [
    ...(search.trim()
      ? [
          {
            id: "search",
            label: "ค้นหา: " + search.trim(),
            clear: () => setSearch(""),
          },
        ]
      : []),
    ...(status !== "all"
      ? [
          {
            id: "status",
            label: labels[status as keyof typeof labels],
            clear: () => setStatus("all"),
          },
        ]
      : []),
    ...(department !== "all"
      ? [
          {
            id: "department",
            label: department === "__blank" ? "ไม่ระบุแผนก" : department,
            clear: () => setDepartment("all"),
          },
        ]
      : []),
    ...(messenger !== "all"
      ? [
          {
            id: "messenger",
            label:
              messengers.find(([id]) => (id || "__blank") === messenger)?.[1] ||
              "ผู้รับงาน",
            clear: () => setMessenger("all"),
          },
        ]
      : []),
  ];
  const job = snapshot.jobs.find((j) => j.id === selected);
  return (
    <div className="management-shell">
      <aside className="management-sidebar">
        <a className="management-brand" href="#/">
          <Icon name="jobs" /> <b>บริหารงานบริการ</b>
        </a>
        <nav aria-label="เมนูจัดการ">
          <button
            className={tab === "jobs" ? "selected" : ""}
            onClick={() => setTab("jobs")}
          >
            <Icon name="jobs" size={18} /> งานทั้งหมด{" "}
            <span>{snapshot.jobs.length}</span>
          </button>
          {snapshot.profile?.role === "admin" && (
            <button
              className={tab === "users" ? "selected" : ""}
              onClick={() => setTab("users")}
            >
              <Icon name="account" size={18} /> บัญชีผู้ใช้
            </button>
          )}
        </nav>
        <div className="management-account">
          <b>{snapshot.profile?.display_name}</b>
          <small>
            {snapshot.profile?.role === "admin"
              ? "ผู้ดูแลระบบ"
              : "ผู้จัดการงาน"}
          </small>
          <button disabled={busy} onClick={onLogout}>
            ออกจากระบบ
          </button>
        </div>
      </aside>
      <main className="management-main">
        <header className="management-topbar">
          <div>
            <h1>{tab === "users" ? "บัญชีผู้ใช้" : "งานทั้งหมด"}</h1>
          </div>
          <div className="management-actions">
            <button className="secondary" disabled={busy} onClick={onRefresh}>
              {busy ? (
                <Loading />
              ) : (
                <>
                  <Icon name="refresh" size={16} /> โหลดใหม่
                </>
              )}
            </button>
            <a
              className="primary form-link"
              href="https://suttipat-cmd.github.io/document-messenger-management/#/request"
            >
              แบบฟอร์ม
            </a>
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
                  className={
                    "summary-status " + s + (status === s ? " selected" : "")
                  }
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
              <div className="management-filters">
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
                  <select
                    aria-label="แผนก"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    <option value="all">ทุกแผนก</option>
                    {departments.map((d) => (
                      <option key={d || "__blank"} value={d || "__blank"}>
                        {d || "ไม่ระบุแผนก"}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="ผู้รับงาน"
                    value={messenger}
                    onChange={(e) => setMessenger(e.target.value)}
                  >
                    <option value="all">ผู้รับงานทั้งหมด</option>
                    {messengers.map(([id, name]) => (
                      <option key={id || "__blank"} value={id || "__blank"}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="management-date-filters">
                  <label>
                    ตั้งแต่วันที่
                    <input
                      type="date"
                      aria-label="ตั้งแต่วันที่"
                      min="0001-01-01"
                      max="9999-12-31"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    ถึงวันที่
                    <input
                      type="date"
                      aria-label="ถึงวันที่"
                      min={from || "0001-01-01"}
                      max="9999-12-31"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                  <button
                    className="filter-quick"
                    onClick={() => {
                      const d = today();
                      setFrom(d);
                      setTo(d);
                    }}
                  >
                    วันนี้
                  </button>
                  {filtered && (
                    <button className="filter-clear" onClick={resetFilters}>
                      ล้างตัวกรอง
                    </button>
                  )}
                  <span className="filter-count" role="status">
                    {filtered
                      ? `${jobs.length} จาก ${snapshot.jobs.length} งาน`
                      : `${jobs.length} งาน`}
                  </span>
                </div>
                {chips.length > 0 && (
                  <div className="ds-chips" aria-label="ตัวกรองที่เลือก">
                    {chips.map((c) => (
                      <span className="ds-chip" key={c.id}>
                        {c.label}
                        <span
                          className="ds-tooltip"
                          data-tooltip={"ลบ " + c.label}
                        >
                          <button
                            aria-label={"ลบตัวกรอง " + c.label}
                            onClick={c.clear}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {invalidDates && (
                  <p className="filter-error" role="alert">
                    วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด
                  </p>
                )}
              </div>
              <div
                className="management-table"
                role="table"
                aria-label="งานทั้งหมด"
              >
                <div className="management-row table-heading" role="row">
                  {[
                    "ลำดับ",
                    "วันที่",
                    "เลขงาน",
                    "ชื่องาน",
                    "แผนก",
                    "ผู้มอบหมาย",
                    "ผู้รับส่งเอกสาร",
                    "สถานะ",
                    "ความคืบหน้า",
                  ].map((h) => (
                    <span role="columnheader" key={h}>
                      {h}
                    </span>
                  ))}
                </div>
                {visibleJobs.map((j, index) => (
                  <button
                    key={j.id}
                    className={
                      "management-row job-status-" +
                      j.status +
                      " " +
                      (selected === j.id ? "selected" : "")
                    }
                    onClick={() => setSelected(j.id)}
                  >
                    <span className="ordinal" data-label="ลำดับ">
                      {pageStart + index + 1}
                    </span>
                    <span data-label="วันที่">{dateLabel(j.jobDate)}</span>
                    <span className="code" data-label="เลขงาน">
                      {j.id}
                    </span>
                    <span className="job-title" data-label="ชื่องาน">
                      <b>{j.title}</b>
                    </span>
                    <span data-label="แผนก">{j.department || "—"}</span>
                    <span data-label="ผู้มอบหมาย">{j.person}</span>
                    <span data-label="ผู้รับส่งเอกสาร">
                      {j.messengerName || "—"}
                    </span>
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
              {!jobs.length && (
                <EmptyState
                  title={
                    snapshot.jobs.length ? "ไม่พบงานตามตัวกรอง" : "ยังไม่มีงาน"
                  }
                  description={
                    snapshot.jobs.length
                      ? "ลองเปลี่ยนหรือล้างตัวกรอง"
                      : "เริ่มมอบหมายงานผ่านแบบฟอร์ม"
                  }
                  action={
                    snapshot.jobs.length ? (
                      <button className="secondary" onClick={resetFilters}>
                        ล้างตัวกรอง
                      </button>
                    ) : (
                      <a
                        className="primary form-link"
                        href="https://suttipat-cmd.github.io/document-messenger-management/#/request"
                      >
                        แบบฟอร์ม
                      </a>
                    )
                  }
                />
              )}
              {jobs.length > 0 && (
                <div className="ds-pagination">
                  <label>
                    แสดง{" "}
                    <select
                      aria-label="จำนวนงานต่อหน้า"
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                    >
                      {[10, 20, 50].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>{" "}
                    งานต่อหน้า
                  </label>
                  <span>
                    {pageStart + 1}–
                    {Math.min(pageStart + pageSize, jobs.length)} จาก{" "}
                    {jobs.length} งาน
                  </span>
                  <nav aria-label="แบ่งหน้างาน">
                    <button
                      aria-label="หน้าก่อนหน้า"
                      disabled={page === 1}
                      onClick={() => goPage(page - 1)}
                    >
                      <Icon name="back" size={16} />
                    </button>
                    {Array.from(
                      { length: Math.min(5, pageCount) },
                      (_, i) =>
                        Math.max(1, Math.min(page - 2, pageCount - 4)) + i,
                    ).map((n) => (
                      <button
                        key={n}
                        aria-label={"หน้า " + n}
                        aria-current={n === page ? "page" : undefined}
                        onClick={() => goPage(n)}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      aria-label="หน้าถัดไป"
                      disabled={page === pageCount}
                      onClick={() => goPage(page + 1)}
                    >
                      <Icon name="chevron" size={16} />
                    </button>
                  </nav>
                </div>
              )}
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
  const [detailTab, setDetailTab] = useState("details");
  async function run(action: Action, stopId?: string) {
    try {
      await onCommand(job, action, stopId, "");
    } catch {
      /* workspace error */
    }
  }
  return (
    <aside className="management-detail" aria-label="รายละเอียดงาน">
      <header>
        <span className="code">{job.id}</span>
        <button aria-label="ปิดรายละเอียด" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <nav className="ds-breadcrumb" aria-label="เส้นทางนำทาง">
        <button onClick={onClose}>งานทั้งหมด</button>
        <Icon name="chevron" size={12} />
        <span>{job.id}</span>
      </nav>
      <h2>{job.title}</h2>
      <span className={"status-tag " + job.status}>{labels[job.status]}</span>
      <div className="ds-tabs" role="tablist" aria-label="ข้อมูลของงาน">
        {[
          ["details", "รายละเอียด"],
          ["history", "ประวัติ"],
        ].map(([id, label]) => (
          <button
            id={"tab-" + id}
            role="tab"
            key={id}
            aria-selected={detailTab === id}
            aria-controls={"panel-" + id}
            onClick={() => setDetailTab(id)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
                const next = id === "details" ? "history" : "details";
                setDetailTab(next);
                document.getElementById("tab-" + next)?.focus();
              }
            }}
            tabIndex={detailTab === id ? 0 : -1}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id="panel-details"
        role="tabpanel"
        aria-labelledby="tab-details"
        hidden={detailTab !== "details"}
      >
        <dl>
          <dt>วันที่</dt>
          <dd>{dateLabel(job.jobDate)}</dd>
          <dt>แผนก</dt>
          <dd>{job.department || "—"}</dd>
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
          <dt>ผู้รับส่งเอกสาร</dt>
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
                {s.contact}{" "}
                {s.phone && <a href={"tel:" + s.phone}>{s.phone}</a>}
              </p>
            )}
            {s.note && <p>{s.note}</p>}
          </section>
        ))}
        {job.returnReason && <p>เหตุผลคืนเอกสาร: {job.returnReason}</p>}
      </div>
      <div
        id="panel-history"
        role="tabpanel"
        aria-labelledby="tab-history"
        hidden={detailTab !== "history"}
      >
        <h3>ประวัติ</h3>
        {!job.events?.length && <EmptyState title="ยังไม่มีประวัติ" />}
        <ol className="management-timeline">
          {job.events?.map((e, i) => (
            <li key={i}>
              <p>{e.text}</p>
              <small>{new Date(e.time).toLocaleString("th-TH")}</small>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
