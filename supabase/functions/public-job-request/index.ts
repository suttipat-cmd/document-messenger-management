import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
const origins = new Set(['https://suttipat-cmd.github.io','http://127.0.0.1:5173','http://localhost:5173'])
Deno.serve(async (req: Request) => {
 const origin=req.headers.get('origin')
 const headers: Record<string,string> = {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'}
 if(origin&&origins.has(origin)) headers['Access-Control-Allow-Origin']=origin
 headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS'
 headers['Access-Control-Allow-Headers']='content-type, apikey'
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers})
 if(origin&&!origins.has(origin))return reply(403,{message:'ไม่อนุญาตเว็บไซต์นี้'})
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
 if(!['GET','POST'].includes(req.method))return reply(405,{message:'ไม่รองรับคำขอนี้'})
 try {
  const url=Deno.env.get('SUPABASE_URL')
  const secrets=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const key=secrets.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!key)return reply(503,{message:'ระบบยังไม่พร้อม กรุณาลองใหม่ภายหลัง'})
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  if(req.method==='GET'){
   const {data,error}=await admin.rpc('messenger_intake_options')
   if(error)return reply(503,{message:'โหลดรายชื่อ Messenger ไม่สำเร็จ'})
   return reply(200,{messengers:data})
  }
  if(!req.headers.get('content-type')?.startsWith('application/json'))return reply(415,{message:'รูปแบบข้อมูลไม่ถูกต้อง'})
  const reader=req.body?.getReader();if(!reader)return reply(400,{message:'ไม่พบข้อมูล'})
  let size=0;const chunks:Uint8Array[]=[]
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();return reply(413,{message:'ข้อมูลยาวเกินกำหนด กรุณาลดรายละเอียด'})}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  let body:Record<string,unknown>;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply(400,{message:'รูปแบบข้อมูลไม่ถูกต้อง'})}
  if(!body||Array.isArray(body)||typeof body!=='object')return reply(400,{message:'รูปแบบข้อมูลไม่ถูกต้อง'})
  if(body.website)return reply(400,{message:'ไม่สามารถรับคำขอได้'})
  const {requestKey,title,requester,requesterPhone,department,messengerId,stops}=body
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if(typeof requestKey!=='string'||!uuid.test(requestKey)||typeof messengerId!=='string'||!uuid.test(messengerId))return reply(422,{message:'กรุณาเลือก Messenger และตรวจข้อมูลอีกครั้ง'})
  const address=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'
  // Never store raw IP addresses or forward client Authorization headers.
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key+':'+address))
  const bucket=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')
  const {data,error}=await admin.rpc('messenger_intake_submit',{p_key:requestKey,p_payload:{title,requester,requesterPhone,department,messengerId,stops},p_bucket:bucket})
  if(error){
   if(error.code==='P0429')return reply(429,{message:'มีการส่งงานจำนวนมาก กรุณาลองใหม่อีกสักครู่'})
   if(error.code==='P0409')return reply(409,{message:'คำขอนี้ถูกใช้แล้ว กรุณารีเฟรชฟอร์มก่อนเริ่มงานใหม่'})
   if(error.code==='P0404')return reply(422,{message:'Messenger คนนี้ยังไม่พร้อมรับงาน กรุณาโหลดรายชื่อใหม่'})
   if(error.code?.startsWith('22')||error.code?.startsWith('23'))return reply(422,{message:'ข้อมูลไม่ครบหรือยาวเกินกำหนด กรุณาตรวจทุกจุดรับ–ส่ง'})
   return reply(503,{message:'ยังยืนยันผลไม่ได้ กรุณากดส่งอีกครั้งด้วยข้อมูลเดิม'})
  }
  return reply(200,data)
 }catch{return reply(503,{message:'ยังยืนยันผลไม่ได้ กรุณากดส่งอีกครั้งด้วยข้อมูลเดิม'})}
})
