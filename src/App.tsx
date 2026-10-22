import { dateLabel } from "./lib/dates";
import { useState } from "react";
import type { Action, Profile } from "./lib/workspace";
import "./App.css";

type Stop = {
  id: string;
  name: string;
  address: string;
  kind: string;
  status: "pending" | "retry" | "done";
  photo?: string;
  note?: string;
  contact?: string;
  phone?: string;
};
export type Job = {
  dbId?: string;
  version?: number;
  returned?: boolean;
  id: string;
  title: string;
  person: string;
  requesterPhone?: string;
  jobDate?: string;
  messengerName?: string;
  messengerId?: string;
  department: string;
  status: "new" | "active" | "returning" | "done";
  stops: Stop[];
  returnPhoto?: string;
  returnReason?: string;
  events?: { text: string; time: string }[];
  completedAt?: string;
};
type Tab = "jobs" | "stops" | "history" | "account";
const initial: Job[] = [
  {
    id: "MSG-0261",
    title: "รับ–ส่งเอกสารฝ่ายบัญชี",
    person: "คุณเมย์",
    department: "บัญชี",
    status: "active",
    stops: [
      {
        id: "s1",
        name: "สำนักงานใหญ่",
        address: "ชั้น 3 · แผนกบัญชี",
        kind: "รับเอกสาร",
        status: "done",
      },
      {
        id: "s2",
        name: "ธนาคารกสิกรไทย",
        address: "สาขาสีลม · เคาน์เตอร์บริการ",
        kind: "ส่งเอกสาร",
        status: "pending",
      },
      {
        id: "s3",
        name: "อาคารสาทรธานี",
        address: "ชั้น 12 · ติดต่อฝ่ายการเงิน",
        kind: "ส่งเอกสาร",
        status: "pending",
      },
    ],
  },
  {
    id: "MSG-0262",
    title: "นำส่งเอกสารสัญญา",
    person: "คุณต้น",
    department: "ธุรการ",
    status: "new",
    stops: [
      {
        id: "s4",
        name: "สำนักงานพระราม 9",
        address: "จุดรับเอกสาร · ล็อบบี้ชั้น 1",
        kind: "รับเอกสาร",
        status: "pending",
      },
      {
        id: "s5",
        name: "อาคารจีทาวเวอร์",
        address: "ชั้น 18 · ติดต่อคุณแอน",
        kind: "ส่งเอกสาร",
        status: "pending",
      },
    ],
  },
  {
    id: "MSG-0263",
    title: "คืนเอกสารลงนาม",
    person: "คุณฝน",
    department: "ธุรการ",
    status: "returning",
    returnReason: "ผู้รับขอให้ส่งเอกสารกลับแก้ไข",
    stops: [
      {
        id: "s6",
        name: "สำนักงานคู่ค้า",
        address: "ฝ่ายจัดซื้อ · จุดส่งเอกสาร",
        kind: "ส่งเอกสาร",
        status: "retry",
        note: "เอกสารต้องแก้ไขก่อนลงนาม",
      },
    ],
  },
];
const labels = {
  new: "รอรับงาน",
  active: "กำลังดำเนินการ",
  returning: "รอคืนเอกสาร",
  done: "เสร็จสิ้น",
};
const icon = (name: string) => (
  <span aria-hidden="true">
    {
      (
        { jobs: "▤", stops: "⌖", history: "◷", account: "○" } as Record<
          string,
          string
        >
      )[name]
    }
  </span>
);
export type RemoteWorkspace = {
  jobs: Job[];
  order: string[];
  profile: Profile;
  saving: boolean;
  onCommand: (
    job: Job,
    action: Action,
    stopId?: string,
    note?: string,
  ) => Promise<unknown>;
  onReorder: (ids: string[]) => Promise<unknown>;
  onLogout: () => Promise<void>;
};
export default function App({ remote }: { remote?: RemoteWorkspace } = {}) {
  const [demoJobs, setJobs] = useState<Job[]>(initial);
  const jobs = remote?.jobs ?? demoJobs;
  const [tab, setTab] = useState<Tab>("jobs");
  const [selected, setSelected] = useState<string>();
  const [stopId, setStopId] = useState<string>();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [stopFilter, setStopFilter] = useState("all");
  const [arranging, setArranging] = useState(false);
  const [demoOrder, setRouteOrder] = useState(
    initial.flatMap((j) => j.stops.map((s) => s.id)),
  );
  const routeOrder = remote?.order ?? demoOrder;
  const [lastJob, setLastJob] = useState<string>("MSG-0261");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [clock, setClock] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const job = jobs.find((j) => j.id === selected);
  const stop = job?.stops.find((s) => s.id === stopId);
  const active = jobs.filter((j) => j.status !== "done");
  const update = (id: string, patch: Partial<Job>) =>
    setJobs((old) => old.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  const open = (j: Job) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setLastJob(j.id);
    setArranging(false);
    setSelected(j.id);
    setStopId(undefined);
    setNote("");
    setNotice("");
  };
  const back = () => {
    window.scrollTo({ top: 0, behavior: "instant" });
    if (stopId) setStopId(undefined);
    else setSelected(undefined);
    setNote("");
    setNotice("");
  };
  const navigate = (t: Tab) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setClock(Date.now());
    setTab(t);
    setSelected(undefined);
    setStopId(undefined);
    setNotice("");
    setNote("");
    setArranging(false);
  };
  const record = (j: Job, text: string) => [
    ...(j.events || []),
    { text, time: new Date().toISOString() },
  ];
  const runRemote = async (
    j: Job,
    action: Action,
    st?: string,
    reason = "",
  ) => {
    if (!remote) return;
    setNotice("");
    try {
      await remote.onCommand(j, action, st, reason);
      setStopId(undefined);
      setNote("");
      setNotice("บันทึกข้อมูลแล้ว");
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch {
      setNotice("ยังยืนยันผลไม่ได้ กรุณาตรวจข้อความการเชื่อมต่อแล้วโหลดใหม่");
    }
  };
  const accept = (j: Job) => {
    if (remote) {
      void runRemote(j, "accept");
      return;
    }
    update(j.id, { status: "active", events: record(j, "รับงานแล้ว") });
    setNotice("รับงานแล้ว เลือกจุดที่ต้องการทำได้เลย");
    setLastJob(j.id);
  };
  const move = (id: string, direction: number, visibleIds: string[]) => {
    const index = visibleIds.indexOf(id);
    const other = visibleIds[index + direction];
    if (!other) return;
    const reorderRoute = (old: string[]) => {
      const next = [...old];
      const a = next.indexOf(id),
        b = next.indexOf(other);
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    };
    if (remote) {
      const ids = reorderRoute(routeOrder).filter((id) =>
        jobs.some(
          (j) => j.status === "active" && j.stops.some((st) => st.id === id),
        ),
      );
      void remote
        .onReorder(ids)
        .catch(() =>
          setNotice("บันทึกลำดับไม่สำเร็จ กรุณาโหลดใหม่แล้วลองอีกครั้ง"),
        );
    } else setRouteOrder(reorderRoute);
  };
  const sortStops = (stops: Stop[]) =>
    [...stops].sort(
      (a, b) => routeOrder.indexOf(a.id) - routeOrder.indexOf(b.id),
    );
  const matches = (j: Job) =>
    [
      j.id,
      j.title,
      j.person,
      j.department,
      ...j.stops.flatMap((s) => [s.name, s.address]),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase());
  const route = active
    .filter((j) => j.status === "active")
    .flatMap((j) =>
      j.stops
        .filter((s) => s.status !== "done")
        .map((stop) => ({ job: j, stop })),
    )
    .sort(
      (a, b) => routeOrder.indexOf(a.stop.id) - routeOrder.indexOf(b.stop.id),
    );
  const shownRoute = route.filter(
    ({ job: j, stop: s }) =>
      [j.id, j.title, j.person, s.name, s.address]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()) &&
      (stopFilter === "all" ||
        (stopFilter === "retry"
          ? s.status === "retry"
          : s.kind === stopFilter)),
  );
  const shownJobs = active.filter(
    (j) => (filter === "all" || j.status === filter) && matches(j),
  );
  const resume =
    jobs.find((j) => j.id === lastJob && j.status === "active") ||
    active.find((j) => j.status === "active");
  const searchBox = (
    <label className="search">
      <span aria-hidden="true">⌕</span>
      <input
        aria-label="ค้นหางานหรือสถานที่"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ค้นหาเลขงาน สถานที่ หรือผู้มอบหมาย"
      />
      {search && (
        <button aria-label="ล้างคำค้นหา" onClick={() => setSearch("")}>
          ×
        </button>
      )}
    </label>
  );
  const openStop = (j: Job, st: Stop) => {
    open(j);
    setStopId(st.id);
    setNote(st.note || "");
  };
  const stopCard = (j: Job, st: Stop, index: number, visibleIds: string[]) => (
    <article className={"route-card " + st.status} key={st.id}>
      <div className="row">
        <span className="code">
          {j.id} · {st.kind}
        </span>
        <span
          className={
            "status " +
            (st.status === "retry"
              ? "returning"
              : st.status === "done"
                ? "done"
                : "active")
          }
        >
          {(j.returnPhoto || j.returned) && st.status !== "done"
            ? "คืนเอกสารแล้ว"
            : st.status === "done"
              ? "สำเร็จ"
              : st.status === "retry"
                ? "กลับมาทำใหม่"
                : "รอดำเนินการ"}
        </span>
      </div>
      <div className="stop-heading">
        <span className="number">{st.status === "done" ? "✓" : index + 1}</span>
        <div>
          <h3>{st.name}</h3>
          <p>{st.address}</p>
        </div>
      </div>
      <p className="contact">
        {st.contact ? `ผู้ติดต่อ: ${st.contact}` : `ผู้มอบหมาย: ${j.person}`}
        {!st.phone && " · ยังไม่มีเบอร์โทร"}
      </p>
      {st.note && <p className="reason">{st.note}</p>}
      {arranging && j.status === "active" ? (
        <div className="arrange-actions">
          <button
            className="secondary"
            aria-label={`เลื่อน ${st.name} ขึ้น`}
            disabled={index === 0}
            onClick={() => move(st.id, -1, visibleIds)}
          >
            ↑ ขึ้น
          </button>
          <button
            className="secondary"
            aria-label={`เลื่อน ${st.name} ลง`}
            disabled={index === visibleIds.length - 1}
            onClick={() => move(st.id, 1, visibleIds)}
          >
            ↓ ลง
          </button>
        </div>
      ) : (
        <div className="route-actions">
          {st.phone ? (
            <a className="action-link" href={"tel:" + st.phone}>
              โทร
            </a>
          ) : (
            <button disabled aria-label="ยังไม่มีเบอร์โทร">
              โทร
            </button>
          )}
          <a
            className="action-link"
            href={
              "https://www.google.com/maps/search/?api=1&query=" +
              encodeURIComponent(st.name + " " + st.address)
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            นำทาง ↗
          </a>
          <button
            className="action-primary"
            disabled={j.status === "new"}
            onClick={() => openStop(j, st)}
          >
            {st.status === "done" || j.status === "done"
              ? "ดูหลักฐาน"
              : "ดำเนินการ"}
          </button>
        </div>
      )}
    </article>
  );
  const completeStop = () => {
    if (!job || !stop || job.status !== "active") return;
    if (remote) {
      void runRemote(job, "complete_stop", stop.id, note);
      return;
    }
    const next = job.stops.map((s) =>
      s.id === stop.id ? { ...s, status: "done" as const, note } : s,
    );
    update(job.id, {
      stops: next,
      status: next.every((s) => s.status === "done") ? "done" : "active",
      completedAt: next.every((s) => s.status === "done")
        ? new Date().toISOString()
        : undefined,
      events: record(job, `สำเร็จ: ${stop.name}`),
    });
    setStopId(undefined);
    setNote("");
    setNotice("บันทึกจุดดำเนินการแล้ว");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const retry = () => {
    if (!job || !stop || job.status !== "active") return;
    if (!note.trim()) {
      setNotice("ระบุเหตุผลสั้น ๆ เพื่อกลับมาทำต่อ");
      return;
    }
    if (remote) {
      void runRemote(job, "retry_stop", stop.id, note);
      return;
    }
    update(job.id, {
      stops: job.stops.map((s) =>
        s.id === stop.id ? { ...s, status: "retry", note } : s,
      ),
      events: record(job, `กลับมาทำใหม่: ${stop.name} · ${note.trim()}`),
    });
    setStopId(undefined);
    setNote("");
    setNotice("เก็บจุดนี้ไว้กลับมาทำใหม่แล้ว");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const returnJob = () => {
    if (!job || job.status !== "active") return;
    if (!note.trim()) {
      setNotice("ระบุเหตุผลการคืนเอกสารก่อนดำเนินการ");
      return;
    }
    if (remote) {
      void runRemote(job, "start_return", undefined, note);
      return;
    }
    update(job.id, {
      status: "returning",
      returnReason: note.trim(),
      events: record(job, `เริ่มคืนเอกสาร · ${note.trim()}`),
    });
    setStopId(undefined);
    setNotice("งานยังไม่จบจนกว่าจะคืนเอกสารให้ผู้มอบหมาย");
  };
  const card = (j: Job) => (
    <article className="task" key={j.id}>
      <div className="row">
        <span className="code">{j.id}</span>
        <span className={"status " + j.status}>
          {j.returnPhoto || j.returned ? "คืนเอกสารแล้ว" : labels[j.status]}
        </span>
      </div>
      <h3>{j.title}</h3>
      {j.jobDate && <small>{dateLabel(j.jobDate)}</small>}
      <p>
        {j.person} · {j.department}
      </p>
      <div className="progress">
        <i
          style={{
            width: `${(j.stops.filter((s) => s.status === "done").length / j.stops.length) * 100}%`,
          }}
        />
      </div>
      <div className="row foot">
        <span>
          สำเร็จ {j.stops.filter((s) => s.status === "done").length}/
          {j.stops.length} จุด
          {j.stops.some((s) => s.status === "retry")
            ? ` · ทำใหม่ ${j.stops.filter((s) => s.status === "retry").length}`
            : ""}
        </span>
      </div>
      {j.status === "returning" && (
        <p className="return-warning">
          ↩ ต้องนำเอกสารจริงกลับคืน · {j.returnReason}
        </p>
      )}
      <div className="card-actions">
        <button className="secondary" onClick={() => open(j)}>
          ดูรายละเอียด
        </button>
        {j.status === "new" ? (
          <button className="primary" onClick={() => accept(j)}>
            รับงาน
          </button>
        ) : j.status === "returning" ? (
          <button className="primary" onClick={() => open(j)}>
            ยืนยันคืนเอกสาร
          </button>
        ) : j.status === "active" ? (
          <button
            className="primary"
            onClick={() => {
              const next = sortStops(j.stops).find(
                (st) => st.status !== "done",
              );
              if (next) openStop(j, next);
              else open(j);
            }}
          >
            ทำต่อ →
          </button>
        ) : null}
      </div>
    </article>
  );
  return (
    <div className="app">
      <header className="top">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("jobs");
          }}
          className="brand"
        >
          <span className="brandmark">
            m<span>↗</span>
          </span>
          <span>
            บริหารงานบริการ<small>งานของฉัน</small>
          </span>
        </a>
        <span className="avatar">น</span>
      </header>
      {!remote && <div className="demo">ข้อมูลตัวอย่าง</div>}
      <fieldset className="workspace-body" disabled={!!remote?.saving}>
        <main>
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button aria-label="ปิดข้อความ" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}
          {job ? (
            <>
              <button className="back" onClick={back}>
                ← {stop ? "กลับรายละเอียดงาน" : "กลับรายการ"}
              </button>
              <div className="row">
                <span className="eyebrow">{job.id}</span>
                <span className={"status " + job.status}>
                  {labels[job.status]}
                </span>
              </div>
              <h1>{stop ? stop.name : job.title}</h1>
              <p className="subtitle">
                {stop ? stop.address : `${job.person} · ${job.department}`}
              </p>
              {job.requesterPhone && (
                <a
                  className="action-link requester-phone"
                  href={"tel:" + job.requesterPhone}
                >
                  โทรหาผู้มอบหมาย · {job.requesterPhone}
                </a>
              )}
              {job.status === "new" ? (
                <section className="panel">
                  <h2>งานใหม่สำหรับคุณ</h2>
                  <p>
                    มี {job.stops.length} จุดรับ–ส่ง
                    เมื่อรับงานแล้วคุณสามารถเลือกจุดและจัดลำดับได้เอง
                  </p>
                  <button className="primary" onClick={() => accept(job)}>
                    รับงานนี้ →
                  </button>
                </section>
              ) : null}
              {job.status === "returning" ? (
                <section className="panel">
                  <div className="largeicon">↩</div>
                  <h2>นำเอกสารคืนผู้มอบหมาย</h2>
                  <p>
                    คืนให้ {job.person} · {job.department}{" "}
                    แล้วยืนยันการส่งคืนเอกสารจริง
                  </p>
                  <p>เหตุผล: {job.returnReason}</p>
                  <Photo />
                  <button
                    className="primary"
                    disabled={!!remote?.saving}
                    onClick={() => {
                      if (remote) {
                        void runRemote(job, "confirm_return");
                        return;
                      }
                      update(job.id, {
                        status: "done",
                        returned: true,
                        completedAt: new Date().toISOString(),
                        events: record(job, "คืนเอกสารให้ผู้มอบหมายสำเร็จ"),
                      });
                      setNotice("ยืนยันคืนเอกสารแล้ว งานเสร็จสิ้น");
                    }}
                  >
                    ยืนยันคืนเอกสารและปิดงาน
                  </button>
                </section>
              ) : stop ? (
                <section className="panel">
                  <span className="pill">{stop.kind}</span>
                  <h2>
                    {stop.status === "done"
                      ? "ดำเนินการเรียบร้อย"
                      : "หลักฐานการดำเนินการ"}
                  </h2>
                  {stop.status === "done" || job.status === "done" ? (
                    <>
                      {stop.photo ? (
                        <img
                          className="preview"
                          src={stop.photo}
                          alt="รูปหลักฐานของจุดนี้"
                        />
                      ) : (
                        <p>
                          {(job.returnPhoto || job.returned) &&
                          stop.status !== "done"
                            ? "จุดนี้ยังไม่สำเร็จ เอกสารถูกคืนให้ผู้มอบหมายแล้ว"
                            : "ดำเนินการแล้ว"}
                        </p>
                      )}
                      {stop.note && <p>{stop.note}</p>}
                    </>
                  ) : (
                    <>
                      <Photo />
                      <label className="field">
                        หมายเหตุ / เหตุผลที่ทำไม่สำเร็จ
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="กรอกเมื่อมีข้อมูลเพิ่มเติม"
                          rows={3}
                        />
                      </label>
                      <button
                        className="primary"
                        disabled={!!remote?.saving}
                        onClick={completeStop}
                      >
                        ยืนยันดำเนินการสำเร็จ ✓
                      </button>
                      <button className="secondary" onClick={retry}>
                        เก็บไว้กลับมาทำใหม่
                      </button>
                      <button className="text-danger" onClick={returnJob}>
                        นำเอกสารกลับคืนผู้มอบหมาย
                      </button>
                    </>
                  )}
                </section>
              ) : (
                <>
                  <section className="summary">
                    <div>
                      <small>ความคืบหน้า</small>
                      <strong>
                        {job.stops.filter((s) => s.status === "done").length}
                        <span> / {job.stops.length} จุด</span>
                      </strong>
                    </div>
                    <div className="ring">
                      {Math.round(
                        (job.stops.filter((s) => s.status === "done").length /
                          job.stops.length) *
                          100,
                      )}
                      %
                    </div>
                  </section>
                  <div className="section-title">
                    <h2>จุดรับ–ส่ง</h2>
                    {job.status === "active" && (
                      <button
                        className="mode-button"
                        aria-pressed={arranging}
                        onClick={() => setArranging(!arranging)}
                      >
                        {arranging ? "✓ เสร็จแล้ว" : "⇅ จัดลำดับ"}
                      </button>
                    )}
                  </div>
                  <p className="hint">
                    {arranging
                      ? "ใช้ปุ่มขึ้น–ลงเพื่อเปลี่ยนลำดับ จุดอื่นจะคงลำดับเดิม"
                      : "เลือกทำจุดไหนก่อนก็ได้ หรือเปิดจุดรับ–ส่งเพื่อดูข้ามงาน"}
                  </p>
                  <div className="stop-list">
                    {sortStops(job.stops).map((st, i, list) =>
                      stopCard(
                        job,
                        st,
                        i,
                        list.map((x) => x.id),
                      ),
                    )}
                  </div>
                  {job.status === "done" && (
                    <section className="panel">
                      <h2>✓ งานเสร็จสิ้น</h2>
                      <p>
                        {job.returnPhoto || job.returned
                          ? "คืนเอกสารให้ผู้มอบหมายเรียบร้อยแล้ว"
                          : "ดำเนินการครบทุกจุดแล้ว"}
                      </p>
                      {job.returnPhoto && (
                        <img
                          className="preview"
                          src={job.returnPhoto}
                          alt="หลักฐานคืนเอกสาร"
                        />
                      )}
                    </section>
                  )}
                </>
              )}
              {!stop && (
                <section className="panel">
                  <h2>ลำดับเหตุการณ์</h2>
                  {job.events?.length ? (
                    <ol className="timeline">
                      {job.events.map((event, i) => (
                        <li key={i}>
                          <span>{event.text}</span>
                          <time dateTime={event.time}>
                            {new Date(event.time).toLocaleString("th-TH", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>
                      ข้อมูลเริ่มต้นตัวอย่าง · ยังไม่มีเหตุการณ์ในรอบทดลองนี้
                    </p>
                  )}
                </section>
              )}
            </>
          ) : tab === "jobs" ? (
            <>
              <div className="greeting">
                พื้นที่ทำงานของ {remote?.profile.display_name || "คุณนัท"}
              </div>
              <div className="row">
                <h1>
                  {remote?.profile.role === "admin" ||
                  remote?.profile.role === "super_user"
                    ? "งานทั้งหมด"
                    : "งานของฉัน"}
                </h1>
              </div>
              <div className="stats" aria-label="สรุปงาน">
                {(
                  [
                    ["new", "งานใหม่"],
                    ["active", "กำลังทำ"],
                    ["returning", "รอคืน"],
                    ["done", "สำเร็จ"],
                  ] as const
                ).map(([status, title]) => (
                  <button
                    key={status}
                    className={"stat " + status}
                    onClick={() => {
                      setSearch("");
                      if (status === "done") navigate("history");
                      else setFilter(status);
                    }}
                  >
                    <span>{title}</span>
                    <strong>
                      {jobs.filter((j) => j.status === status).length}
                    </strong>
                  </button>
                ))}
              </div>
              {resume && (
                <button
                  className="resume"
                  onClick={() => {
                    const next = sortStops(resume.stops).find(
                      (st) => st.status !== "done",
                    );
                    if (next) openStop(resume, next);
                    else open(resume);
                  }}
                >
                  <span>
                    <small>ทำต่อจากงานล่าสุด · {resume.id}</small>
                    <b>
                      {sortStops(resume.stops).find(
                        (st) => st.status !== "done",
                      )?.name || resume.title}
                    </b>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
              {searchBox}
              <div className="filters four" aria-label="กรองสถานะ">
                {[
                  ["all", "ทั้งหมด"],
                  ["new", "งานใหม่"],
                  ["active", "กำลังทำ"],
                  ["returning", "รอคืน"],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    aria-pressed={filter === v}
                    className={filter === v ? "selected" : ""}
                    onClick={() => setFilter(v)}
                  >
                    {label}
                    <small>
                      {
                        active.filter((j) => v === "all" || j.status === v)
                          .length
                      }
                    </small>
                  </button>
                ))}
              </div>
              <div className="section-title">
                <h2>รายการงาน</h2>
                <span>{shownJobs.length} งาน</span>
              </div>
              <div className="tasks">{shownJobs.map(card)}</div>
              {!shownJobs.length && (
                <Empty
                  text={
                    search
                      ? "ไม่พบงานที่ตรงกับคำค้นหา ลองค้นหาด้วยเลขงานหรือสถานที่"
                      : "ไม่มีงานในสถานะนี้"
                  }
                />
              )}
            </>
          ) : tab === "stops" ? (
            <>
              <span className="eyebrow">เส้นทางของฉัน</span>
              <h1>จุดรับ–ส่ง</h1>
              <p className="subtitle">เลือกจุดจากทุกงานที่รับแล้วได้อิสระ</p>
              {searchBox}
              <div className="filters four" aria-label="กรองจุด">
                {[
                  ["all", "ทั้งหมด"],
                  ["รับเอกสาร", "จุดรับ"],
                  ["ส่งเอกสาร", "จุดส่ง"],
                  ["retry", "ทำใหม่"],
                ].map(([v, title]) => (
                  <button
                    key={v}
                    className={stopFilter === v ? "selected" : ""}
                    aria-pressed={stopFilter === v}
                    onClick={() => {
                      setStopFilter(v);
                      setArranging(false);
                    }}
                  >
                    {title}
                  </button>
                ))}
              </div>
              <div className="section-title">
                <h2>เหลือ {shownRoute.length} จุด</h2>
                <button
                  className="mode-button"
                  disabled={shownRoute.length < 2}
                  aria-pressed={arranging}
                  onClick={() => setArranging(!arranging)}
                >
                  {arranging ? "✓ เสร็จแล้ว" : "⇅ จัดลำดับ"}
                </button>
              </div>
              {arranging && (
                <p className="hint">
                  จัดลำดับได้ข้ามงาน ลำดับนี้ใช้กับปุ่มทำต่อด้วย
                </p>
              )}
              {shownRoute.map(({ job: j, stop: st }, i) =>
                stopCard(
                  j,
                  st,
                  i,
                  shownRoute.map((x) => x.stop.id),
                ),
              )}
              {!shownRoute.length && (
                <Empty
                  text={
                    search ? "ไม่พบจุดที่ตรงกับคำค้นหา" : "ไม่มีจุดในรายการนี้"
                  }
                />
              )}
              {active.some((j) => j.status === "returning" && matches(j)) && (
                <section className="panel">
                  <h2>↩ เอกสารที่ต้องคืน</h2>
                  <p>งานเหล่านี้ยังไม่เสร็จ ต้องคืนเอกสารให้ผู้มอบหมาย</p>
                  {active
                    .filter((j) => j.status === "returning" && matches(j))
                    .map(card)}
                </section>
              )}
            </>
          ) : tab === "history" ? (
            <>
              <span className="eyebrow">งานเสร็จสิ้น</span>
              <h1>ประวัติงาน</h1>
              <p className="subtitle">
                ตรวจรายละเอียด รูปหลักฐาน และลำดับเหตุการณ์
              </p>
              {searchBox}
              <label className="history-select">
                ช่วงเวลา
                <select
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="today">วันนี้</option>
                  <option value="week">7 วันที่ผ่านมา</option>
                </select>
              </label>
              {jobs
                .filter(
                  (j) =>
                    j.status === "done" &&
                    matches(j) &&
                    (historyFilter === "all" ||
                      (!!j.completedAt &&
                        (historyFilter === "today"
                          ? new Date(j.completedAt).toDateString() ===
                            new Date(clock).toDateString()
                          : clock - Date.parse(j.completedAt) < 7 * 86400000))),
                )
                .map(card)}
              {!jobs.some(
                (j) =>
                  j.status === "done" &&
                  matches(j) &&
                  (historyFilter === "all" ||
                    (!!j.completedAt &&
                      (historyFilter === "today"
                        ? new Date(j.completedAt).toDateString() ===
                          new Date(clock).toDateString()
                        : clock - Date.parse(j.completedAt) < 7 * 86400000))),
              ) && <Empty text="ไม่พบประวัติในช่วงเวลาหรือคำค้นหานี้" />}
            </>
          ) : (
            <>
              <span className="eyebrow">พื้นที่ทำงาน</span>
              <h1>บัญชีของฉัน</h1>
              <section className="panel">
                <span className="avatar big">น</span>
                <h2>
                  {remote
                    ? `${remote.profile.display_name} · ${{ admin: "ผู้ดูแลระบบ", super_user: "ผู้จัดการงาน", messenger: "ผู้รับส่งเอกสาร" }[remote.profile.role]}`
                    : "คุณนัท · ผู้รับส่งเอกสาร"}
                </h2>
              </section>
              {remote ? (
                <section className="panel">
                  <h2>การเข้าสู่ระบบ</h2>

                  <button
                    className="secondary"
                    onClick={() => void remote.onLogout()}
                  >
                    ออกจากระบบ
                  </button>
                </section>
              ) : (
                <>
                  <section className="panel">
                    <h2>เริ่มทดลองใหม่</h2>
                    <p>
                      ล้างความคืบหน้าและรูปชั่วคราว
                      แล้วกลับไปใช้ข้อมูลตัวอย่างเริ่มต้น
                    </p>
                    <button
                      className="secondary"
                      onClick={() => {
                        setJobs(initial);
                        setRouteOrder(
                          initial.flatMap((j) => j.stops.map((st) => st.id)),
                        );
                        setSearch("");
                        setFilter("all");
                        setStopFilter("all");
                        setHistoryFilter("all");
                        setLastJob("MSG-0261");
                        navigate("jobs");
                        setNotice("เริ่มต้นข้อมูลตัวอย่างใหม่แล้ว");
                      }}
                    >
                      รีเซ็ตข้อมูลตัวอย่าง
                    </button>
                  </section>
                  <p className="hint">ข้อมูลตัวอย่าง</p>
                </>
              )}
            </>
          )}
        </main>
      </fieldset>
      <nav className="bottom" aria-label="เมนูหลัก">
        {(["jobs", "stops", "history", "account"] as Tab[]).map((t, i) => (
          <button
            key={t}
            disabled={!!remote?.saving}
            className={tab === t ? "current" : ""}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => navigate(t)}
          >
            {icon(t)}
            <span>{["งานของฉัน", "จุดรับ–ส่ง", "ประวัติ", "บัญชี"][i]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
function Photo() {
  return (
    <div className="photo-box">
      <button className="camera" disabled>
        <span aria-hidden="true">◎</span>แนบรูปหลักฐาน
      </button>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <section className="empty">
      <span aria-hidden="true">✓</span>
      <p>{text}</p>
    </section>
  );
}
