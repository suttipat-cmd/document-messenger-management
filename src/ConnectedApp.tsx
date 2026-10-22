import ValidatedForm from "./ui/ValidatedForm";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import Dialog from "./ui/Dialog";
import { Skeleton, Toast, Alert } from "./ui/Feedback";
import App from "./App";
import Required from "./Required";
import Manager from "./Manager";
import Loading from "./Loading";
const PublicRequest = lazy(() => import("./PublicRequest"));
import { supabase } from "./lib/supabase";
import {
  command,
  errorText,
  loadWorkspace,
  reorder,
  setProfile,
} from "./lib/workspace";
import type { Snapshot } from "./lib/workspace";

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
  return publicRoute ? (
    <Suspense fallback={<Skeleton label="กำลังโหลดแบบฟอร์ม" />}>
      <PublicRequest />
    </Suspense>
  ) : (
    <Workspace />
  );
}
function Workspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const toastSerial = useRef(0);
  const closeToast = useCallback(() => setToast(null), []);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [demo, setDemo] = useState(false);
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
          : "กำลังเชื่อมต่อการอัปเดต · ใช้ปุ่มโหลดใหม่ได้",
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
    setToast(null);
    setError("");
    let committed = false;
    try {
      await operation();
      committed = true;
      await refresh();
      setToast({ id: ++toastSerial.current, message: "บันทึกข้อมูลสำเร็จ" });
    } catch (e) {
      setError(
        committed
          ? "บันทึกแล้ว แต่โหลดผลล่าสุดไม่สำเร็จ กรุณาโหลดใหม่"
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
      <div className="workspace-loading">
        {!error && <Skeleton />}
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
          เข้าสู่ระบบด้วย {session.user.email} แล้ว กรุณาให้ผู้ดูแลระบบ
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
        {toast && (
          <Toast key={toast.id} message={toast.message} onClose={closeToast} />
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        {saving && (
          <div className="save-indicator">
            <Loading label="กำลังบันทึก…" />
          </div>
        )}
        <Manager
          onCommand={(j, a, s, n) => mutate(() => command(j, a, s, n))}
          snapshot={snapshot}
          busy={saving || refreshing || loggingOut}
          onRefresh={() => void refresh().catch(() => {})}
          onLogout={() => void logout()}
          users={snapshot.profiles.map((p, index) => (
            <ProfileEditor
              index={index + 1}
              key={p.id + String(p.active) + p.role + p.display_name}
              profile={p}
              saving={saving}
              onSave={async (profile) => {
                await mutate(() => setProfile(profile));
              }}
            />
          ))}
        />
      </>
    );
  return (
    <>
      {toast && (
        <Toast key={toast.id} message={toast.message} onClose={closeToast} />
      )}
      {error && (
        <div className="connection-error" role="alert">
          {error}
          <button onClick={() => void refresh().catch(() => {})}>
            โหลดใหม่
          </button>
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
        <button
          disabled={saving || refreshing}
          onClick={() => void refresh().catch(() => {})}
        >
          โหลดใหม่
        </button>
      </div>
      <App
        remote={{
          jobs: snapshot.jobs,
          order: snapshot.order,
          profile: snapshot.profile,
          saving,
          onCommand: (j, a, s, n) => mutate(() => command(j, a, s, n)),
          onReorder: (ids) => mutate(() => reorder(ids)),
          onLogout: logout,
        }}
      />
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
      <span className="eyebrow">ระบบบริหารงานบริการ</span>
      <h1>{signup ? "สร้างบัญชี" : "เข้าสู่ระบบ"}</h1>

      <a className="public-entry" href="#/request">
        สร้างงานโดยไม่ต้องเข้าสู่ระบบ →
      </a>
      <ValidatedForm
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
                  ? "สร้างบัญชีไม่สำเร็จ ตรวจสอบข้อมูลหรือติดต่อผู้ดูแลระบบ"
                  : "เข้าสู่ระบบไม่สำเร็จ ตรวจสอบอีเมล รหัสผ่าน และการยืนยันอีเมล",
              );
              return;
            }
            if (signup)
              setMessage(
                "กรุณายืนยันอีเมล แล้วกลับเข้าสู่ระบบ บัญชีทั่วไปต้องรอผู้ดูแลระบบ เปิดใช้งาน",
              );
          } catch {
            setMessage("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          อีเมล <Required />
          <input
            required
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          รหัสผ่าน <Required />
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
        {!supabase && <p role="alert">ยังไม่ได้กำหนด การเชื่อมต่อระบบ</p>}
        <button className="primary" disabled={busy || !supabase}>
          {busy ? (
            <Loading label="กำลังดำเนินการ…" />
          ) : signup ? (
            "สร้างบัญชีและยืนยันอีเมล"
          ) : (
            "เข้าสู่ระบบ"
          )}
        </button>
      </ValidatedForm>
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
export function ProfileEditor({
  index,
  profile,
  saving,
  onSave,
}: {
  index: number;
  profile: Snapshot["profiles"][number];
  saving: boolean;
  onSave: (p: Snapshot["profiles"][number]) => Promise<void>;
}) {
  const [p, setP] = useState(profile);
  const [confirm, setConfirm] = useState(false);
  const [failure, setFailure] = useState("");
  const sensitive = p.role !== profile.role || p.active !== profile.active;
  async function save() {
    setFailure("");
    try {
      await onSave(p);
      setConfirm(false);
    } catch {
      setFailure("ยังยืนยันผลไม่ได้ กรุณาตรวจข้อความการเชื่อมต่อและโหลดใหม่");
    }
  }
  return (
    <>
      <ValidatedForm
        className="profile-editor"
        onSubmit={(e) => {
          e.preventDefault();
          if (sensitive) setConfirm(true);
          else void save();
        }}
      >
        <fieldset disabled={saving}>
          <span className="account-ordinal">
            <small>ลำดับ</small>
            {index}
          </span>
          <span className="code">
            {profile.email || profile.id.slice(0, 8)}
          </span>
          <label className="field">
            ชื่อ <Required />
            <input
              required
              maxLength={120}
              value={p.display_name}
              onChange={(e) => setP({ ...p, display_name: e.target.value })}
            />
          </label>
          <label className="field">
            บทบาท <Required />
            <select
              required
              value={p.role}
              onChange={(e) =>
                setP({ ...p, role: e.target.value as typeof p.role })
              }
            >
              <option value="messenger">ผู้รับส่งเอกสาร</option>
              <option value="super_user">ผู้จัดการงาน</option>
              <option value="admin">ผู้ดูแลระบบ</option>
            </select>
          </label>
          <label className="active-check">
            <input
              type="checkbox"
              role="switch"
              aria-checked={p.active}
              checked={p.active}
              onChange={(e) => setP({ ...p, active: e.target.checked })}
            />
            เปิดใช้งาน
          </label>
          <button className="secondary">
            {saving ? <Loading label="กำลังบันทึก…" /> : "บันทึก"}
          </button>
        </fieldset>
        {failure && !confirm && <Alert tone="danger">{failure}</Alert>}
      </ValidatedForm>
      {confirm && (
        <Dialog
          title="ยืนยันการเปลี่ยนสิทธิ์"
          busy={saving}
          onClose={() => setConfirm(false)}
        >
          <p>{profile.email || profile.display_name}</p>
          <dl className="review-data">
            <dt>บทบาท</dt>
            <dd>
              {
                {
                  admin: "ผู้ดูแลระบบ",
                  super_user: "ผู้จัดการงาน",
                  messenger: "ผู้รับส่งเอกสาร",
                }[p.role]
              }
            </dd>
            <dt>การใช้งาน</dt>
            <dd>{p.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</dd>
          </dl>
          {failure && <Alert tone="danger">{failure}</Alert>}
          <div className="dialog-actions">
            <button
              className="secondary"
              disabled={saving}
              onClick={() => setConfirm(false)}
            >
              ยกเลิก
            </button>
            <button
              className="primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? (
                <Loading label="กำลังบันทึก…" />
              ) : (
                "ยืนยันการเปลี่ยนสิทธิ์"
              )}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
