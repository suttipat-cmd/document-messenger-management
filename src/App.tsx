import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

type Stop = { id: string; name: string; address: string; kind: string; status: 'pending' | 'retry' | 'done'; photo?: string; note?: string }
type Job = { id: string; title: string; person: string; department: string; status: 'new' | 'active' | 'returning' | 'done'; stops: Stop[]; returnPhoto?: string; returnReason?: string }
type Tab = 'jobs' | 'stops' | 'history' | 'account'
const initial: Job[] = [
  { id: 'MSG-0261', title: 'รับ–ส่งเอกสารฝ่ายบัญชี', person: 'คุณเมย์', department: 'บัญชี', status: 'active', stops: [
    { id: 's1', name: 'สำนักงานใหญ่', address: 'ชั้น 3 · แผนกบัญชี', kind: 'รับเอกสาร', status: 'done' },
    { id: 's2', name: 'ธนาคารกสิกรไทย', address: 'สาขาสีลม · เคาน์เตอร์บริการ', kind: 'ส่งเอกสาร', status: 'pending' },
    { id: 's3', name: 'อาคารสาทรธานี', address: 'ชั้น 12 · ติดต่อฝ่ายการเงิน', kind: 'ส่งเอกสาร', status: 'pending' },
  ] },
  { id: 'MSG-0262', title: 'นำส่งเอกสารสัญญา', person: 'คุณต้น', department: 'ธุรการ', status: 'new', stops: [
    { id: 's4', name: 'สำนักงานพระราม 9', address: 'จุดรับเอกสาร · ล็อบบี้ชั้น 1', kind: 'รับเอกสาร', status: 'pending' },
    { id: 's5', name: 'อาคารจีทาวเวอร์', address: 'ชั้น 18 · ติดต่อคุณแอน', kind: 'ส่งเอกสาร', status: 'pending' },
  ] },
]
const labels = { new: 'รอรับงาน', active: 'กำลังดำเนินการ', returning: 'รอคืนเอกสาร', done: 'เสร็จสิ้น' }
const icon = (name: string) => <span aria-hidden="true">{({ jobs: '▤', stops: '⌖', history: '◷', account: '○' } as Record<string, string>)[name]}</span>
export default function App() {
  const [jobs, setJobs] = useState<Job[]>(initial)
  const [tab, setTab] = useState<Tab>('jobs')
  const [selected, setSelected] = useState<string>()
  const [stopId, setStopId] = useState<string>()
  const [filter, setFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<string>()
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const job = jobs.find(j => j.id === selected)
  const stop = job?.stops.find(s => s.id === stopId)
  const active = jobs.filter(j => j.status !== 'done')
  const update = (id: string, patch: Partial<Job>) => setJobs(old => old.map(j => j.id === id ? { ...j, ...patch } : j))
  const open = (j: Job) => { setSelected(j.id); setStopId(undefined); setPhoto(undefined); setNote(''); setNotice('') }
  const back = () => { if (stopId) setStopId(undefined); else setSelected(undefined); setPhoto(undefined); setNote(''); setNotice('') }
  const navigate = (t: Tab) => { setTab(t); setSelected(undefined); setStopId(undefined); setNotice('') }
  const move = (index: number, direction: number) => { if (!job) return; const next = [...job.stops]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; update(job.id, { stops: next }) }
  const readPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (!file.type.startsWith('image/')) { setNotice('กรุณาเลือกไฟล์รูปภาพ'); return }
    if (file.size > 15 * 1024 * 1024) { setNotice('กรุณาเลือกรูปขนาดไม่เกิน 15 MB'); return }
    setBusy(true); setNotice('')
    const reader = new FileReader(); reader.onload = () => { setPhoto(String(reader.result)); setBusy(false) }; reader.onerror = () => { setNotice('เปิดรูปไม่สำเร็จ กรุณาลองใหม่'); setBusy(false) }; reader.readAsDataURL(file)
  }
  const completeStop = () => {
    if (!job || !stop || !photo) return
    const next = job.stops.map(s => s.id === stop.id ? { ...s, status: 'done' as const, photo, note } : s)
    update(job.id, { stops: next, status: next.every(s => s.status === 'done') ? 'done' : 'active' }); setStopId(undefined); setPhoto(undefined); setNote(''); setNotice('บันทึกจุดดำเนินการแล้ว')
  }
  const retry = () => { if (!job || !stop) return; if (!note.trim()) { setNotice('ระบุเหตุผลสั้น ๆ เพื่อกลับมาทำต่อ'); return }; update(job.id, { stops: job.stops.map(s => s.id === stop.id ? { ...s, status: 'retry', note } : s) }); setStopId(undefined); setNote(''); setPhoto(undefined); setNotice('เก็บจุดนี้ไว้กลับมาทำใหม่แล้ว') }
  const returnJob = () => { if (!job) return; if (!note.trim()) { setNotice('ระบุเหตุผลการคืนเอกสารก่อนดำเนินการ'); return }; update(job.id, { status: 'returning', returnReason: note.trim() }); setStopId(undefined); setPhoto(undefined); setNotice('งานยังไม่จบจนกว่าจะคืนเอกสารพร้อมรูปหลักฐาน') }
  const card = (j: Job) => <button className="task" key={j.id} onClick={() => open(j)}><div className="row"><span className="code">{j.id}</span><span className={'status ' + j.status}>{labels[j.status]}</span></div><h3>{j.title}</h3><p>{j.person} · {j.department}</p><div className="progress"><i style={{ width: `${j.stops.filter(s => s.status === 'done').length / j.stops.length * 100}%` }} /></div><div className="row foot"><span>{j.stops.filter(s => s.status === 'done').length}/{j.stops.length} จุดสำเร็จ</span><b>ดูงาน <span aria-hidden="true">↗</span></b></div></button>
  return <div className="app"><header className="top"><a href="#" onClick={e => { e.preventDefault(); navigate('jobs') }} className="brand"><span className="brandmark">m<span>↗</span></span><span>messenger<small>DOCUMENT WORKSPACE</small></span></a><span className="avatar">น</span></header>
    <div className="demo">ต้นแบบทดลอง · ข้อมูลตัวอย่าง · รูปเก็บในหน่วยความจำชั่วคราว</div>
    <main>
      {notice && <div role="status" className="notice">{notice}<button aria-label="ปิดข้อความ" onClick={() => setNotice('')}>×</button></div>}
      {job ? <>
        <button className="back" onClick={back}>← {stop ? 'กลับรายละเอียดงาน' : 'กลับรายการ'}</button>
        <div className="row"><span className="eyebrow">{job.id}</span><span className={'status ' + job.status}>{labels[job.status]}</span></div>
        <h1>{stop ? stop.name : job.title}</h1><p className="subtitle">{stop ? stop.address : `${job.person} · ${job.department}`}</p>
        {job.status === 'new' ? <section className="panel"><h2>งานใหม่สำหรับคุณ</h2><p>มี {job.stops.length} จุดรับ–ส่ง เมื่อรับงานแล้วคุณสามารถเลือกจุดและจัดลำดับได้เอง</p><button className="primary" onClick={() => { update(job.id, { status: 'active' }); setNotice('รับงานแล้ว เลือกจุดที่ต้องการทำได้เลย') }}>รับงานนี้ →</button></section> : null}
        {job.status === 'returning' ? <section className="panel"><div className="largeicon">↩</div><h2>นำเอกสารคืนผู้มอบหมาย</h2><p>คืนให้ {job.person} · {job.department} แล้วถ่ายรูปเพื่อยืนยันการส่งคืน</p><p>เหตุผล: {job.returnReason}</p><Photo photo={photo} busy={busy} onChoose={() => input.current?.click()} /><button className="primary" disabled={!photo || busy} onClick={() => { update(job.id, { status: 'done', returnPhoto: photo }); setPhoto(undefined); setNotice('ยืนยันคืนเอกสารแล้ว งานเสร็จสิ้น') }}>ยืนยันคืนเอกสารและปิดงาน</button></section> : stop ? <section className="panel"><span className="pill">{stop.kind}</span><h2>{stop.status === 'done' ? 'ดำเนินการเรียบร้อย' : 'หลักฐานการดำเนินการ'}</h2>{stop.status === 'done' ? <>{stop.photo ? <img className="preview" src={stop.photo} alt="รูปหลักฐานของจุดนี้" /> : <p>จุดตัวอย่างที่ดำเนินการแล้ว</p>}{stop.note && <p>{stop.note}</p>}</> : <><Photo photo={photo} busy={busy} onChoose={() => input.current?.click()} /><label className="field">หมายเหตุ / เหตุผลที่ทำไม่สำเร็จ<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="กรอกเมื่อมีข้อมูลเพิ่มเติม" rows={3} /></label><button className="primary" disabled={!photo || busy} onClick={completeStop}>ยืนยันสำเร็จพร้อมรูปหลักฐาน ✓</button><button className="secondary" onClick={retry}>เก็บไว้กลับมาทำใหม่</button><button className="text-danger" onClick={returnJob}>นำเอกสารกลับคืนผู้มอบหมาย</button></>}</section> : <>
          <section className="summary"><div><small>ความคืบหน้า</small><strong>{job.stops.filter(s => s.status === 'done').length}<span> / {job.stops.length} จุด</span></strong></div><div className="ring">{Math.round(job.stops.filter(s => s.status === 'done').length / job.stops.length * 100)}%</div></section>
          <div className="section-title"><h2>จุดรับ–ส่ง</h2><span>เลือกทำจุดไหนก่อนก็ได้</span></div><p className="hint">ใช้ปุ่ม ↑ ↓ เพื่อสลับลำดับจุด</p>
          <div className="stop-list">{job.stops.map((s, i) => <article className={'stop ' + s.status} key={s.id}><span className="number">{s.status === 'done' ? '✓' : i + 1}</span><button className="stop-main" disabled={job.status === 'new'} onClick={() => { setStopId(s.id); setPhoto(undefined); setNote(s.note || ''); setNotice('') }}><small>{s.kind} · {s.status === 'done' ? 'สำเร็จ' : s.status === 'retry' ? 'กลับมาทำใหม่' : 'รอดำเนินการ'}</small><h3>{s.name}</h3><p>{s.address}</p>{s.note && <p className="reason">{s.note}</p>}</button>{job.status === 'active' && <div className="reorder"><button aria-label={`เลื่อน ${s.name} ขึ้น`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button aria-label={`เลื่อน ${s.name} ลง`} disabled={i === job.stops.length - 1} onClick={() => move(i, 1)}>↓</button></div>}</article>)}</div>
          {job.status === 'done' && <section className="panel"><h2>✓ งานเสร็จสิ้น</h2><p>{job.returnPhoto ? 'คืนเอกสารให้ผู้มอบหมายเรียบร้อยแล้ว' : 'ดำเนินการครบทุกจุดแล้ว'}</p>{job.returnPhoto && <img className="preview" src={job.returnPhoto} alt="หลักฐานคืนเอกสาร" />}</section>}
        </>}
      </> : tab === 'jobs' ? <><div className="greeting">พร้อมออกเดินทางแล้วหรือยัง</div><h1>งานของฉัน<span className="wave"> ↗</span></h1><p className="subtitle">รับงาน เลือกจุด แล้วไปต่อได้เลย</p><section className="hero"><div><span>งานที่ต้องดูแล</span><strong>{active.length}<small>งาน</small></strong><p>{active.reduce((n, j) => n + j.stops.filter(s => s.status !== 'done').length, 0)} จุดรอดำเนินการ</p></div><div className="route-art" aria-hidden="true"><span>⌖</span><i /><span>✓</span></div></section><div className="filters" aria-label="กรองสถานะ">{[['all', 'ทั้งหมด'], ['active', 'กำลังทำ'], ['new', 'งานใหม่']].map(([v, label]) => <button key={v} aria-pressed={filter === v} className={filter === v ? 'selected' : ''} onClick={() => setFilter(v)}>{label} <small>{active.filter(j => v === 'all' || j.status === v).length}</small></button>)}</div><div className="section-title"><h2>รายการงาน</h2><span>อัปเดตในรอบทดลองนี้</span></div><div className="tasks">{active.filter(j => filter === 'all' || j.status === filter).map(card)}</div>{!active.filter(j => filter === 'all' || j.status === filter).length && <Empty text="ไม่มีงานในรายการนี้" />}</> : tab === 'stops' ? <><span className="eyebrow">YOUR ROUTE</span><h1>จุดรับ–ส่ง</h1><p className="subtitle">จุดที่ยังต้องดำเนินการจากงานที่รับแล้ว</p>{active.filter(j => j.status === 'active').flatMap(j => j.stops.filter(s => s.status !== 'done').map(s => <button className="task" key={s.id} onClick={() => { open(j); setStopId(s.id); setNote(s.note || '') }}><div className="row"><span className="code">{j.id}</span><span className="pill">{s.kind}</span></div><h3>{s.name}</h3><p>{s.address}</p><b>{s.status === 'retry' ? 'กลับมาทำใหม่' : 'ดำเนินการ →'}</b></button>))}{!active.some(j => j.status === 'active' && j.stops.some(s => s.status !== 'done')) && <Empty text="ไม่มีจุดรอดำเนินการ" />}</> : tab === 'history' ? <><span className="eyebrow">COMPLETED</span><h1>ประวัติงาน</h1><p className="subtitle">งานที่ทำครบหรือคืนเอกสารเรียบร้อยแล้ว</p>{jobs.filter(j => j.status === 'done').map(card)}{!jobs.some(j => j.status === 'done') && <Empty text="ยังไม่มีงานที่เสร็จสิ้น ลองทำงานตัวอย่างให้ครบ" />}</> : <><span className="eyebrow">YOUR WORKSPACE</span><h1>บัญชีของฉัน</h1><section className="panel"><span className="avatar big">น</span><h2>คุณนัท · Messenger</h2><p>บัญชีตัวอย่างสำหรับทดลองขั้นตอนทำงาน</p><span className="pill">โหมดทดลอง</span></section><section className="panel"><h2>เริ่มทดลองใหม่</h2><p>ล้างความคืบหน้าและรูปชั่วคราว แล้วกลับไปใช้ข้อมูลตัวอย่างเริ่มต้น</p><button className="secondary" onClick={() => { setJobs(initial); navigate('jobs'); setNotice('เริ่มต้นข้อมูลตัวอย่างใหม่แล้ว') }}>รีเซ็ตข้อมูลตัวอย่าง</button></section><p className="hint">ยังไม่เชื่อม Supabase Auth หรือ Google Drive รูปจะหายเมื่อรีเฟรชหน้า</p></>}
      <input ref={input} className="file-input" type="file" accept="image/*" capture="environment" aria-label="ถ่ายหรือเลือกรูปหลักฐาน" onChange={e => { void readPhoto(e); e.target.value = '' }} />
    </main><nav className="bottom" aria-label="เมนูหลัก">{(['jobs', 'stops', 'history', 'account'] as Tab[]).map((t, i) => <button key={t} className={tab === t ? 'current' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => navigate(t)}>{icon(t)}<span>{['งานของฉัน', 'จุดรับ–ส่ง', 'ประวัติ', 'บัญชี'][i]}</span></button>)}</nav></div>
}
function Photo({ photo, busy, onChoose }: { photo?: string; busy: boolean; onChoose: () => void }) { return <div className="photo-box">{photo && <img src={photo} className="preview" alt="รูปหลักฐานที่เลือก" />}<button className="camera" disabled={busy} onClick={onChoose}><span aria-hidden="true">◎</span>{busy ? 'กำลังเตรียมรูป…' : photo ? 'ถ่ายใหม่ / เปลี่ยนรูป' : 'ถ่ายรูป / เลือกรูปหลักฐาน'}<small>ต้องมีรูปก่อนยืนยันสำเร็จ</small></button></div> }
function Empty({ text }: { text: string }) { return <section className="empty"><span aria-hidden="true">✓</span><p>{text}</p></section> }
