import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import App from "./App";
import Manager from "./Manager";
import Loading from "./Loading";
import PublicRequest from "./PublicRequest";
import { supabase } from "./lib/supabase";
import {
  command,
  createJob,
  errorText,
  loadWorkspace,
  reorder,
  setProfile,
} from "./lib/workspace";
import type { Snapshot, CreateJob } from "./lib/workspace";

export default function ConnectedApp() {
  const [publicRoute, setPublicRoute] = useState(() =>
    window.location.hash.startsWith("#/request"),
  );
  useEffect(() => {
    const change = () => {
      setPublicRoute(window.location.hash.startsWith("#/request"));
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return publicRoute ? <PublicRequest /> : <Workspace />;
}
function Workspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [demo, setDemo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [connection, setConnection] = useState("กำลังเชื่อมต่อ");
  const request = useRef(0);
  const lock = useRef(false);
  const authId = useRef<string | undefined>(undefined);
  const invalidate = useCallback(() => {
    request.current += 1;
  }, []);
  const refresh = useCallback(async () => {
    if (!session) return;
    const n = ++request.current;
    setRefreshing(true);
    try {
      const data = await loadWorkspace(session.user.id);
      if (n === request.current) {
        setSnapshot(data);
        setError("");
      }
    } catch (e) {
      if (n === request.current) setError(errorText(e));
      throw e;
    } finally {
      if (n === request.current) setRefreshing(false);
    }
  }, [session]);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (authId.current !== s?.user.id) {
        request.current++;
        setSnapshot(null);
        setError("");
        setCreating(false);
        authId.current = s?.user.id;
      }
      setSession(s);
      setReady(true);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setError("ตรวจสอบการเข้าสู่ระบบไม่สำเร็จ");
      setSession(data.session);
      setReady(true);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
      invalidate();
    };
  }, [invalidate]);
  useEffect(() => {
    if (!session || !supabase) return;
    void Promise.resolve()
      .then(refresh)
      .catch(() => {});
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh().catch(() => {});
      }, 200);
    };
    const channel = supabase.channel("messenger-workspace-" + session.user.id);
    for (const table of [
      "messenger_jobs",
      "messenger_stops",
      "messenger_events",
      "messenger_profiles",
    ])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        schedule,
      );
    channel.subscribe((status) =>
      setConnection(
        status === "SUBSCRIBED"
          ? "อัปเดตอัตโนมัติพร้อมใช้งาน"
          : "กำลังเชื่อมต่อการอัปเดต · ใช้ปุ่มรีเฟรชได้",
      ),
    );
    const onFocus = () => {
      void refresh().catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => {
      void supabase?.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      clearTimeout(timer);
      invalidate();
    };
  }, [session, refresh, invalidate]);
  async function mutate(operation: () => Promise<unknown>) {
    if (lock.current) throw new Error("Saving");
    lock.current = true;
    setSaving(true);
    let committed = false;
    try {
      await operation();
      committed = true;
      await refresh();
    } catch (e) {
      setError(
        committed
          ? "บันทึกแล้ว แต่โหลดผลล่าสุดไม่สำเร็จ กรุณารีเฟรช"
          : errorText(e),
      );
      throw e;
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  const logout = async () => {
    setLoggingOut(true);
    try {
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) setError("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
      }
    } finally {
      setLoggingOut(false);
    }
  };
  if (demo)
    return (
      <>
        <div className="mode-strip">
          <span>กำลังทดลองข้อมูลตัวอย่าง</span>
          <button onClick={() => setDemo(false)}>กลับระบบจริง</button>
        </div>
        <App />
      </>
    );
  if (!ready)
    return (
      <div className="auth-shell">
        <Loading label="กำลังตรวจสอบการเข้าสู่ระบบ…" />
      </div>
    );
  if (!session) return <Auth onDemo={() => setDemo(true)} />;
  if (!snapshot)
    return (
      <div className="auth-shell">
        <Loading label="กำลังโหลดพื้นที่ทำงาน" />
        {error && <p role="alert">{error}</p>}
        <button
          className="primary"
          disabled={refreshing}
          onClick={() => {
            void refresh().catch(() => {});
          }}
        >
          ลองโหลดใหม่
        </button>
        <button className="secondary" onClick={() => void logout()}>
          ออกจากระบบ
        </button>
      </div>
    );
  if (!snapshot.profile?.active)
    return (
      <div className="auth-shell">
        <span className="eyebrow">รอเปิดใช้งาน</span>
        <h1>บัญชียังไม่ได้รับสิทธิ์</h1>
        <p>
          เข้าสู่ระบบด้วย {session.user.email} แล้ว กรุณาให้ Admin
          เปิดใช้งานบัญชี
        </p>
        <button
          className="primary"
          onClick={() => void refresh().catch(() => {})}
        >
          ตรวจสอบสิทธิ์อีกครั้ง
        </button>
        <button className="secondary" onClick={() => void logout()}>
          ออกจากระบบ
        </button>
      </div>
    );
  if (snapshot.profile.role !== "messenger")
    return (
      <>
        {error && (
          <div className="connection-error" role="alert">
            {error}
          </div>
        )}
        {saving && (
          <div className="save-indicator">
            <Loading label="กำลังบันทึก…" />
          </div>
        )}
        {creating ? (
          <div className="compact-form">
            <JobForm
              messengers={snapshot.messengers}
              saving={saving}
              onCancel={() => setCreating(false)}
              onSave={async (input) => {
                try {
                  await mutate(() => createJob(input));
                  setCreating(false);
                } catch {
                  /* banner */
                }
              }}
            />
          </div>
        ) : (
          <Manager
            onCommand={(j, a, s, n) => mutate(() => command(j, a, s, n))}
            snapshot={snapshot}
            busy={saving || refreshing || loggingOut}
            onCreate={() => setCreating(true)}
            onRefresh={() => void refresh().catch(() => {})}
            onLogout={() => void logout()}
            users={snapshot.profiles.map((p) => (
              <ProfileEditor
                key={p.id + String(p.active) + p.role + p.display_name}
                profile={p}
                saving={saving}
                onSave={async (profile) => {
                  try {
                    await mutate(() => setProfile(profile));
                  } catch {
                    /* banner */
                  }
                }}
              />
            ))}
          />
        )}
      </>
    );
  return (
    <>
      {error && (
        <div className="connection-error" role="alert">
          {error}
          <button onClick={() => void refresh().catch(() => {})}>รีเฟรช</button>
        </div>
      )}
      <div className="mode-strip">
        <span>
          {saving || refreshing || loggingOut ? (
            <Loading
              label={
                saving
                  ? "กำลังบันทึก…"
                  : loggingOut
                    ? "กำลังออกจากระบบ…"
                    : "กำลังโหลด…"
              }
            />
          ) : (
            <span
              className="connection-dot"
              title={connection}
              aria-label={connection}
            />
          )}
        </span>
        <a href="#/request">ฟอร์มสร้างงาน</a>
        <button
          disabled={saving || refreshing}
          onClick={() => void refresh().catch(() => {})}
        >
          รีเฟรช
        </button>
      </div>
      {creating ? (
        <JobForm
          messengers={snapshot.messengers}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSave={async (input) => {
            try {
              await mutate(() => createJob(input));
              setCreating(false);
            } catch {
              /* banner displays the failure */
            }
          }}
        />
      ) : (
        <App
          remote={{
            jobs: snapshot.jobs,
            order: snapshot.order,
            profile: snapshot.profile,
            saving,
            onCommand: (j, a, s, n) => mutate(() => command(j, a, s, n)),
            onReorder: (ids) => mutate(() => reorder(ids)),
            onLogout: logout,
            onCreate: () => setCreating(true),
          }}
        />
      )}
    </>
  );
}
function Auth({ onDemo }: { onDemo: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="auth-shell">
      <span className="brandmark">m↗</span>
      <span className="eyebrow">DOCUMENT MESSENGER</span>
      <h1>{signup ? "สร้างบัญชี" : "เข้าสู่ระบบ"}</h1>

      <a className="public-entry" href="#/request">
        สร้างงานโดยไม่ต้องเข้าสู่ระบบ →
      </a>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!supabase) return;
          setBusy(true);
          setMessage("");
          try {
            const result = signup
              ? await supabase.auth.signUp({ email: email.trim(), password })
              : await supabase.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
            if (result.error) {
              setMessage(
                signup
                  ? "สร้างบัญชีไม่สำเร็จ ตรวจสอบข้อมูลหรือติดต่อ Admin"
                  : "เข้าสู่ระบบไม่สำเร็จ ตรวจสอบอีเมล รหัสผ่าน และการยืนยันอีเมล",
              );
              return;
            }
            if (signup)
              setMessage(
                "กรุณายืนยันอีเมลจาก Supabase แล้วกลับเข้าสู่ระบบ บัญชีทั่วไปต้องรอ Admin เปิดใช้งาน",
              );
          } catch {
            setMessage("ติดต่อ Supabase ไม่สำเร็จ กรุณาลองใหม่");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          อีเมล
          <input
            required
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          รหัสผ่าน
          <input
            required
            type="password"
            minLength={signup ? 8 : 1}
            autoComplete={signup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {message && (
          <p className="auth-message" role="status">
            {message}
          </p>
        )}
        {!supabase && (
          <p role="alert">ยังไม่ได้กำหนด Supabase URL และ Publishable Key</p>
        )}
        <button className="primary" disabled={busy || !supabase}>
          {busy ? (
            <Loading label="กำลังดำเนินการ…" />
          ) : signup ? (
            "สร้างบัญชีและยืนยันอีเมล"
          ) : (
            "เข้าสู่ระบบ"
          )}
        </button>
      </form>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          setSignup(!signup);
          setMessage("");
          setPassword("");
        }}
      >
        {signup ? "มีบัญชีแล้ว · เข้าสู่ระบบ" : "สร้างบัญชีใหม่"}
      </button>
      <button className="back" onClick={onDemo}>
        ดูต้นแบบด้วยข้อมูลตัวอย่าง
      </button>
    </div>
  );
}
function JobForm({
  messengers,
  saving,
  onCancel,
  onSave,
}: {
  messengers: Snapshot["messengers"];
  saving: boolean;
  onCancel: () => void;
  onSave: (input: CreateJob) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateJob>({
    title: "",
    requester: "",
    department: "",
    messengerId: "",
    stops: [
      { name: "", address: "", kind: "รับเอกสาร", contact: "", phone: "" },
    ],
  });
  return (
    <main className="manager-form">
      <button className="back" disabled={saving} onClick={onCancel}>
        ← กลับกองงาน
      </button>
      <h1>สร้างและมอบหมายงาน</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(form);
        }}
      >
        <fieldset disabled={saving}>
          {(
            [
              ["title", "ชื่องาน"],
              ["requester", "ผู้มอบหมาย"],
              ["department", "แผนก"],
            ] as const
          ).map(([key, title]) => (
            <label className="field" key={key}>
              {title}
              <input
                required={key !== "department"}
                maxLength={key === "title" ? 200 : 120}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="field">
            Messenger
            <select
              required
              value={form.messengerId}
              onChange={(e) =>
                setForm({ ...form, messengerId: e.target.value })
              }
            >
              <option value="">เลือก Messenger</option>
              {messengers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>
          {!messengers.length && (
            <p className="auth-message">
              ยังไม่มี Messenger ที่เปิดใช้งาน ให้ผู้ใช้สร้างบัญชี แล้ว Admin
              เปิดใช้งานผ่านเมนูจัดการบัญชีผู้ใช้
            </p>
          )}
          {form.stops.map((stop, i) => (
            <section className="panel" key={i}>
              <div className="row">
                <h2>จุดที่ {i + 1}</h2>
                {form.stops.length > 1 && (
                  <button
                    type="button"
                    className="mode-button"
                    onClick={() =>
                      setForm({
                        ...form,
                        stops: form.stops.filter((_, n) => n !== i),
                      })
                    }
                  >
                    ลบจุดนี้
                  </button>
                )}
              </div>
              <label className="field">
                ประเภท
                <select
                  value={stop.kind}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      stops: form.stops.map((s, n) =>
                        n === i ? { ...s, kind: e.target.value } : s,
                      ),
                    })
                  }
                >
                  <option>รับเอกสาร</option>
                  <option>ส่งเอกสาร</option>
                </select>
              </label>
              {(
                [
                  ["name", "ชื่อสถานที่"],
                  ["address", "ที่อยู่"],
                  ["contact", "ผู้ติดต่อ"],
                  ["phone", "เบอร์โทร"],
                ] as const
              ).map(([key, title]) => (
                <label key={key} className="field">
                  {title}
                  <input
                    required={key === "name" || key === "address"}
                    type={key === "phone" ? "tel" : "text"}
                    maxLength={
                      key === "address"
                        ? 1000
                        : key === "phone"
                          ? 40
                          : key === "name"
                            ? 200
                            : 120
                    }
                    value={stop[key]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        stops: form.stops.map((s, n) =>
                          n === i ? { ...s, [key]: e.target.value } : s,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </section>
          ))}
          <button
            type="button"
            className="secondary"
            disabled={form.stops.length >= 50}
            onClick={() =>
              setForm({
                ...form,
                stops: [
                  ...form.stops,
                  {
                    name: "",
                    address: "",
                    kind: "ส่งเอกสาร",
                    contact: "",
                    phone: "",
                  },
                ],
              })
            }
          >
            + เพิ่มจุดรับ–ส่ง
          </button>
          <button className="primary" disabled={!messengers.length}>
            {saving ? <Loading label="กำลังบันทึก…" /> : "สร้างและมอบหมายงาน"}
          </button>
        </fieldset>
      </form>
    </main>
  );
}

function ProfileEditor({
  profile,
  saving,
  onSave,
}: {
  profile: Snapshot["profiles"][number];
  saving: boolean;
  onSave: (p: Snapshot["profiles"][number]) => Promise<void>;
}) {
  const [p, setP] = useState(profile);
  return (
    <form
      className="profile-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(p);
      }}
    >
      <fieldset disabled={saving}>
        <span className="code">{profile.email || profile.id.slice(0, 8)}</span>
        <label className="field">
          ชื่อ
          <input
            required
            maxLength={120}
            value={p.display_name}
            onChange={(e) => setP({ ...p, display_name: e.target.value })}
          />
        </label>
        <label className="field">
          บทบาท
          <select
            value={p.role}
            onChange={(e) =>
              setP({ ...p, role: e.target.value as typeof p.role })
            }
          >
            <option value="messenger">Messenger</option>
            <option value="super_user">Super User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="active-check">
          <input
            type="checkbox"
            checked={p.active}
            onChange={(e) => setP({ ...p, active: e.target.checked })}
          />
          เปิดใช้งาน
        </label>
        <button className="secondary">
          {saving ? <Loading label="กำลังบันทึก…" /> : "บันทึก"}
        </button>
      </fieldset>
    </form>
  );
}
