/*
 DHRUVA ONLINE AND STUDIO backend
 Free/open-source stack: Node.js + Express + SQLite + bcryptjs + secure cookies.
 This server is intentionally required for real authentication, private uploads,
 application storage and admin operations. The frontend alone is not treated as
 a secure system.
*/
require("dotenv").config();
const express=require("express"), path=require("path"), fs=require("fs"), crypto=require("crypto"), cookieParser=require("cookie-parser"), bcrypt=require("bcryptjs"), multer=require("multer"), Database=require("better-sqlite3");

const app=express();
// Render terminates HTTPS at its proxy and forwards requests to this service.
// Trust one proxy hop so Express handles production proxy semantics correctly.
if(process.env.NODE_ENV==="production") app.set("trust proxy",1);
const PORT=Number(process.env.PORT||3000);
const DATA_DIR=path.join(__dirname,"data"), UPLOAD_DIR=path.join(__dirname,"uploads");
fs.mkdirSync(DATA_DIR,{recursive:true});fs.mkdirSync(UPLOAD_DIR,{recursive:true});
const db=new Database(path.join(DATA_DIR,"dhruva.sqlite"));
db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,mobile TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT NOT NULL,required_documents TEXT NOT NULL DEFAULT '[]',processing_info TEXT NOT NULL DEFAULT '',fee_display TEXT NOT NULL DEFAULT '',available INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY AUTOINCREMENT,reference_id TEXT NOT NULL UNIQUE,user_id INTEGER NOT NULL,service_id INTEGER NOT NULL,full_name TEXT NOT NULL,mobile TEXT NOT NULL,details TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Submitted',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(service_id) REFERENCES services(id));
CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY AUTOINCREMENT,application_id INTEGER NOT NULL,original_name TEXT NOT NULL,stored_name TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,title TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS visits(id INTEGER PRIMARY KEY AUTOINCREMENT,visitor_id TEXT NOT NULL,path TEXT NOT NULL,referrer TEXT NOT NULL DEFAULT '',user_agent TEXT NOT NULL DEFAULT '',device TEXT NOT NULL DEFAULT 'Unknown',ip_hash TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);\nCREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at);\nCREATE INDEX IF NOT EXISTS idx_visits_visitor_id ON visits(visitor_id);
CREATE TABLE IF NOT EXISTS security_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_type TEXT NOT NULL,ip_hash TEXT NOT NULL,route TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_hash ON security_events(ip_hash);
CREATE TABLE IF NOT EXISTS security_blocks(ip_hash TEXT PRIMARY KEY,reason TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
`);
const now=()=>new Date().toISOString(), hash=t=>crypto.createHash("sha256").update(t).digest("hex"), random=()=>crypto.randomBytes(32).toString("hex");
function seed(){
 const count=db.prepare("SELECT COUNT(*) c FROM services").get().c;
 if(!count){
  const ins=db.prepare("INSERT INTO services(name,description,required_documents,processing_info,fee_display,available,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)");
  const defaults=[
   ["Online Services","Everyday online assistance from one convenient place.",["Valid mobile number","Service-specific details"],"Depends on the relevant portal.","As applicable",1],
   ["Digital Services","Smart digital solutions for personal and business needs.",["Mobile/email","Service-specific documents"],"Varies by service.","As applicable",1],
   ["Document Services","Organise, prepare and manage digital documents with ease.",["Source documents","Clear scans/photos"],"Depends on file count.","As applicable",1],
   ["Form Filling","Careful assistance for online forms and applications.",["Identity proof","Address/details","Photo/signature where required"],"Subject to portal availability.","As applicable",1],
   ["Online Application Assistance","Guidance through online application steps.",["Application-specific documents","Active mobile number"],"Subject to portal validation.","As applicable",1],
   ["Print / Scan Services","Convenient document printing and scanning support.",["Digital file or original document"],"Many routine requests can be completed during the visit.","As applicable",1]
  ];
  for(const s of defaults)ins.run(s[0],s[1],JSON.stringify(s[2]),s[3],s[4],s[5],now(),now());
 }
}
seed();

app.use(express.json({limit:"1mb"}));app.use(cookieParser());

const securityWindowMs=60*1000, securityMaxRequests=120, requestBuckets=new Map();
function requestIp(req){return String(req.ip||req.socket.remoteAddress||"").replace(/^::ffff:/,"")||"unknown"}
function requestIpHash(req){return hash((process.env.SESSION_SECRET||"visitor-secret")+":"+requestIp(req))}
function securityLog(req,type,details=""){db.prepare("INSERT INTO security_events(event_type,ip_hash,route,details,created_at) VALUES(?,?,?,?,?)").run(type,requestIpHash(req),req.path,String(details).slice(0,500),now())}
function isBlocked(req){const b=db.prepare("SELECT expires_at FROM security_blocks WHERE ip_hash=?").get(requestIpHash(req));if(!b)return false;if(new Date(b.expires_at)<=new Date()){db.prepare("DELETE FROM security_blocks WHERE ip_hash=?").run(requestIpHash(req));return false}return true}
function blockIp(req,reason,minutes=30){const expires=new Date(Date.now()+minutes*60000).toISOString();db.prepare("INSERT INTO security_blocks(ip_hash,reason,expires_at,created_at) VALUES(?,?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET reason=excluded.reason,expires_at=excluded.expires_at").run(requestIpHash(req),reason,expires,now());securityLog(req,"IP_BLOCKED",reason)}
app.use((req,res,next)=>{
  if(req.path==="/api/health"||req.path==="/health")return next();
  // Monitoring-only mode: suspicious traffic is logged but never automatically blocked.
  const key=requestIpHash(req), current=Date.now(), bucket=requestBuckets.get(key);
  if(!bucket||current-bucket.started>=securityWindowMs){requestBuckets.set(key,{started:current,count:1});return next()}
  bucket.count++;
  if(bucket.count>securityMaxRequests){securityLog(req,"RATE_LIMIT","request threshold exceeded (monitoring only)");return next()}
  next();
});
app.use((req,res,next)=>{const start=Date.now();res.on("finish",()=>{if(req.path.startsWith("/api/")&&[401,403,404,429].includes(res.statusCode))securityLog(req,"SUSPICIOUS_RESPONSE",`${res.statusCode} ${Date.now()-start}ms`)});next()});
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  if(process.env.NODE_ENV==="production"){
    res.setHeader("Strict-Transport-Security","max-age=31536000; includeSubDomains");
  }
  if(req.path.startsWith("/api/")) res.setHeader("Cache-Control","no-store");
  next();
});

const publicDir=path.join(__dirname,"..");
function visitorDevice(ua){ua=String(ua||"").toLowerCase();if(/mobile|android|iphone|ipad|ipod/.test(ua))return "Mobile";return "Desktop";}
app.use((req,res,next)=>{
  const isPage=req.method==="GET"&&!req.path.startsWith("/api/")&&!req.path.startsWith("/admin")&&(req.path==="/"||req.path.endsWith(".html"));
  if(!isPage)return next();
  let visitorId=req.cookies.visitor_id;
  if(!visitorId){visitorId=crypto.randomBytes(18).toString("hex");res.cookie("visitor_id",visitorId,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:365*864e5,path:"/"});}
  const ip=String(req.ip||"").replace(/^::ffff:/,"");
  const ipHash=hash((process.env.SESSION_SECRET||"visitor-secret")+":"+ip);
  db.prepare("INSERT INTO visits(visitor_id,path,referrer,user_agent,device,ip_hash,created_at) VALUES(?,?,?,?,?,?,?)").run(visitorId,req.path,String(req.get("referer")||"").slice(0,500),String(req.get("user-agent")||"").slice(0,500),visitorDevice(req.get("user-agent")),ipHash,now());
  next();
});
// Never expose backend source, local database files, uploads, dependency metadata or deployment/config files.
app.use((req,res,next)=>{
  const p=String(req.path||"");
  const blocked=/^\/server(?:\/|$)/i.test(p) ||
    ["/package.json","/package-lock.json","/render.yaml","/.node-version","/.gitignore"].includes(p);
  if(blocked)return res.status(404).end();
  next();
});
app.use(express.static(publicDir,{index:"index.html",dotfiles:"deny"}));

const auth=(req,res,next)=>{
 const raw=req.cookies.session; if(!raw)return res.status(401).json({error:"Authentication required"});
 const row=db.prepare("SELECT u.*,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?").get(hash(raw));
 if(!row||new Date(row.expires_at)<new Date()){if(row)db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(raw));return res.status(401).json({error:"Session expired"})}
 req.user={id:row.id,name:row.name,email:row.email,mobile:row.mobile,role:row.role};next();
};
const admin=(req,res,next)=>{if(req.user?.role!=="admin")return res.status(403).json({error:"Admin access required"});next()};
function issueSession(userId,res){
  const token=random();
  const maxAge=24*60*60*1000;
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(hash(token),userId,new Date(Date.now()+maxAge).toISOString());
  res.cookie("session",token,{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",maxAge,path:"/"});
}
function safeUser(u){return {id:u.id,name:u.name,email:u.email,mobile:u.mobile,role:u.role};}
function ref(){return "DHO-"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+crypto.randomBytes(3).toString("hex").toUpperCase()}

app.post("/api/auth/register",async(req,res)=>{
 const {name,email,mobile,password,confirmPassword}=req.body;
 if(!name||!email||!mobile||!password)return res.status(400).json({error:"All fields are required"});
 if(password!==confirmPassword)return res.status(400).json({error:"Passwords do not match"});
 if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters"});
 try{
  const h=await bcrypt.hash(password,12),t=now(),r=db.prepare("INSERT INTO users(name,email,mobile,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(name.trim(),email.toLowerCase().trim(),mobile.trim(),h,"user",t,t);
  issueSession(r.lastInsertRowid,res);res.json({ok:true,role:"user"});
 }catch(e){res.status(409).json({error:"An account with this email already exists"})}
});
app.post("/api/auth/login",async(req,res)=>{
 const {email,password}=req.body;
 const loginKey=hash(String(email||"").toLowerCase().trim()+":"+requestIp(req));
 const cutoff=new Date(Date.now()-15*60*1000).toISOString();
 const failed=db.prepare("SELECT COUNT(*) c FROM security_events WHERE event_type='LOGIN_FAILED' AND ip_hash=? AND created_at>=?").get(requestIpHash(req),cutoff).c;
 if(failed>=8){
   securityLog(req,"LOGIN_ABUSE","login temporarily throttled after repeated failures");
   return res.status(429).json({error:"Too many failed login attempts. Please try again later."});
 }
 const u=db.prepare("SELECT * FROM users WHERE email=?").get(String(email||"").toLowerCase().trim());
 if(!u||!(await bcrypt.compare(password||"",u.password_hash))){securityLog(req,"LOGIN_FAILED","invalid credentials");return res.status(401).json({error:"Invalid email or password"});}
 securityLog(req,"LOGIN_SUCCESS","authenticated");
 issueSession(u.id,res);res.json({ok:true,role:u.role});
});
app.post("/api/security/honeypot",(req,res)=>{securityLog(req,"HONEYPOT_TRIGGER","bot trap (monitoring only)");res.status(204).end()});
app.get("/api/admin/security",auth,admin,(req,res)=>{
 const events=db.prepare("SELECT id,event_type,route,details,created_at FROM security_events ORDER BY id DESC LIMIT 100").all();
 const blocks=db.prepare("SELECT reason,expires_at,created_at FROM security_blocks WHERE expires_at>? ORDER BY expires_at DESC").all(now());
 const counts=db.prepare("SELECT event_type,COUNT(*) count FROM security_events GROUP BY event_type ORDER BY count DESC").all();
 res.json({events,blocks,counts});
});
app.post("/api/admin/security-chat",auth,admin,(req,res)=>{
 const raw=String(req.body?.message||"").trim();
 if(!raw)return res.status(400).json({error:"Message is required"});
 const m=raw.toLowerCase();
 const today=new Date(); today.setHours(0,0,0,0); const todayIso=today.toISOString();
 const totalVisits=db.prepare("SELECT COUNT(*) c FROM visits").get().c;
 const uniqueVisitors=db.prepare("SELECT COUNT(DISTINCT visitor_id) c FROM visits").get().c;
 const todayVisits=db.prepare("SELECT COUNT(*) c FROM visits WHERE created_at>=?").get(todayIso).c;
 const failed15=db.prepare("SELECT COUNT(*) c FROM security_events WHERE event_type='LOGIN_FAILED' AND created_at>=?").get(new Date(Date.now()-15*60000).toISOString()).c;
 const events24=db.prepare("SELECT COUNT(*) c FROM security_events WHERE created_at>=?").get(new Date(Date.now()-24*3600000).toISOString()).c;
 const activeBlocks=db.prepare("SELECT COUNT(*) c FROM security_blocks WHERE expires_at>?").get(now()).c;
 const topEvents=db.prepare("SELECT event_type,COUNT(*) count FROM security_events WHERE created_at>=? GROUP BY event_type ORDER BY count DESC LIMIT 5").all(new Date(Date.now()-24*3600000).toISOString());
 const formatEvents=topEvents.map(x=>x.event_type+"="+x.count).join(", ")||"none";
 const businessReply="DHRUVA ONLINE AND STUDIO ek online-service aur digital-assistance platform hai. Yahan online services, digital services, document services, form filling, online application assistance aur print/scan support jaise kaam listed hain.";
 const contactReply="Contact details: phone +91 79746 74861, WhatsApp +91 79746 74861, email tiwaridhruv4343@gmail.com, address Mangawan.";
 const serviceReply="Available service categories: Online Services, Digital Services, Document Services, Form Filling, Online Application Assistance, aur Print / Scan Services.";
 const trainingReply="DHRUVA bot ko abhi business information, services, contact details, website status, visitor statistics aur security monitoring ke context mein trained/configured kiya gaya hai. Main sirf website/database mein available information ko factual tareeke se batata hoon.";
 let reply;
 if(/help|command|kya kar|what can|madad/.test(m)) reply="Main DHRUVA ONLINE AND STUDIO ki services, contact details aur website information ke saath visitors, security events, failed logins, active blocks, server status aur security report ke baare mein bata sakta hoon.";
 else if(/dhruva|studio|website|business|company|about|kya hai|kaun/.test(m)) reply=businessReply;
 else if(/service|services|kya kya|kaam|facility|facilities/.test(m)) reply=serviceReply;
 else if(/contact|phone|mobile|number|whatsapp|email|address|pata|mangawan/.test(m)) reply=contactReply;
 else if(/trained|training|knowledge|seekha|bot ko kya/.test(m)) reply=trainingReply;
 else if(/visitor|visits|traffic|users aaye|kitne log|website par/.test(m)) reply=`Visitor stats: total visits ${totalVisits}, unique visitors ${uniqueVisitors}, aur aaj ${todayVisits} visits.`;
 else if(/failed login|login fail|wrong password/.test(m)) reply=`Last 15 minutes mein ${failed15} failed login attempt(s) record hue hain.`;
 else if(/block|blocked|ban/.test(m)) reply=`Abhi ${activeBlocks} active security block(s) hain.`;
 else if(/attack|hack|threat|suspicious|security|danger/.test(m)) reply=`Last 24 hours mein ${events24} security event(s) record hue. Top event types: ${formatEvents}. Main raw evidence ke basis par bata raha hoon; event hona zaroori nahi ki successful attack ho.`;
 else if(/status|health|server|online/.test(m)) reply=`Website server process online hai. Uptime ${Math.floor(process.uptime())} seconds hai, database connected hai, aur ${activeBlocks} active security block(s) hain.`;
 else if(/report|summary|report do|security report/.test(m)) reply=`Security report: last 24h mein ${events24} events, last 15m mein ${failed15} failed logins, ${activeBlocks} active blocks. Visitor total ${totalVisits}, unique ${uniqueVisitors}, today ${todayVisits}.`;
 else reply="Main DHRUVA ONLINE AND STUDIO ke business, services, contact details aur security/website data se jude sawaalon ka jawab de sakta hoon. “help” likho."; res.json({reply});
});
app.post("/api/auth/logout",(req,res)=>{
  const raw=req.cookies.session;
  if(raw)db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(raw));
  res.clearCookie("session",{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/"});
  res.setHeader("Clear-Site-Data",'"cache"');
  res.json({ok:true});
});
app.get("/api/auth/me",(req,res)=>{try{auth(req,res,()=>res.json({user:safeUser(req.user)}))}catch{res.json({user:null})}});
app.post("/api/auth/forgot",(req,res)=>{
 // Production-ready UI endpoint: no reset token is exposed to the browser.
 // Email delivery requires SMTP configuration; without it we return a safe generic message.
 const exists=db.prepare("SELECT id FROM users WHERE email=?").get(String(req.body.email||"").toLowerCase().trim());
 res.json({ok:true,message:"If that email is registered, password-reset instructions will be sent. Configure SMTP in .env to enable delivery."});
});

app.get("/api/services",(req,res)=>{
 const services=db.prepare("SELECT * FROM services ORDER BY id").all().map(s=>({...s,required_documents:JSON.parse(s.required_documents),available:!!s.available}));
 res.json({services});
});
app.get("/api/applications",(req,res)=>{auth(req,res,()=>{
 const apps=db.prepare("SELECT a.*,s.name service_name FROM applications a JOIN services s ON s.id=a.service_id WHERE a.user_id=? ORDER BY a.id DESC").all(req.user.id);res.json({applications:apps});
})});
const upload=multer({
  storage:multer.diskStorage({
    destination:UPLOAD_DIR,
    filename:(req,file,cb)=>{
      const ext=path.extname(String(file.originalname||"")).toLowerCase();
      const allowedExt={".pdf":"application/pdf",".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png"};
      if(!allowedExt[ext]||allowedExt[ext]!==file.mimetype)return cb(new Error("Unsupported file type"));
      cb(null,crypto.randomUUID()+ext);
    }
  }),
  limits:{files:5,fileSize:5*1024*1024},
  fileFilter:(req,file,cb)=>{
    const ext=path.extname(String(file.originalname||"")).toLowerCase();
    const allowedExt={".pdf":"application/pdf",".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png"};
    const ok=Boolean(allowedExt[ext]&&allowedExt[ext]===file.mimetype&&String(file.originalname||"").length<=180);
    cb(null,ok);
  }
});
app.post("/api/applications",auth,upload.array("documents",5),(req,res)=>{
 try{
  const service=db.prepare("SELECT * FROM services WHERE id=? AND available=1").get(req.body.service_id);if(!service)return res.status(400).json({error:"Service unavailable"});
  const t=now(),reference=ref();const tx=db.transaction(()=>{
   const a=db.prepare("INSERT INTO applications(reference_id,user_id,service_id,full_name,mobile,details,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(reference,req.user.id,service.id,req.body.full_name,req.body.mobile,req.body.details,"Submitted",t,t);
   for(const f of req.files||[])db.prepare("INSERT INTO documents(application_id,original_name,stored_name,mime_type,size,created_at) VALUES(?,?,?,?,?,?)").run(a.lastInsertRowid,f.originalname,f.filename,f.mimetype,f.size,t);
   db.prepare("INSERT INTO notifications(user_id,title,message,created_at) VALUES(?,?,?,?)").run(req.user.id,"Application submitted",`Your application ${reference} has been submitted.`,t);
  });tx();res.json({ok:true,reference_id:reference});
 }catch(e){for(const f of req.files||[])try{fs.unlinkSync(f.path)}catch{};res.status(500).json({error:"Could not submit application"})}
});
app.get("/api/notifications",auth,(req,res)=>{
 const userNotes=db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30").all(req.user.id);
 const announcements=db.prepare("SELECT id,title,message,created_at FROM announcements ORDER BY id DESC LIMIT 15").all()
   .map(a=>({id:`announcement-${a.id}`,title:a.title,message:a.message,created_at:a.created_at}));
 res.json({notifications:[...userNotes,...announcements].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,30)});
});

app.get("/api/track",(req,res)=>{
 const v=String(req.query.value||"").trim();if(!v)return res.status(400).json({error:"Enter an application ID or mobile number"});
 const a=db.prepare("SELECT a.*,s.name service_name FROM applications a JOIN services s ON s.id=a.service_id WHERE a.reference_id=? OR a.mobile=? ORDER BY a.id DESC LIMIT 1").get(v,v);
 if(!a)return res.status(404).json({error:"Application not found"});res.json({application:a});
});

app.get("/api/admin/visits",auth,admin,(req,res)=>{
 const totals=db.prepare("SELECT COUNT(*) visits,COUNT(DISTINCT visitor_id) unique_visitors FROM visits").get();
 const today=db.prepare("SELECT COUNT(*) visits,COUNT(DISTINCT visitor_id) unique_visitors FROM visits WHERE date(created_at)=date('now')").get();
 const recent=db.prepare("SELECT id,visitor_id,path,referrer,device,created_at FROM visits ORDER BY id DESC LIMIT 100").all();
 res.json({totals,today,recent});
});
app.get("/api/admin/stats",auth,admin,(req,res)=>{
 const count=q=>db.prepare(q).get().c;res.json({users:count("SELECT COUNT(*) c FROM users WHERE role='user'"),applications:count("SELECT COUNT(*) c FROM applications"),processing:count("SELECT COUNT(*) c FROM applications WHERE status IN ('Under Review','Processing')"),completed:count("SELECT COUNT(*) c FROM applications WHERE status='Completed'")});
});
app.get("/api/admin/applications",auth,admin,(req,res)=>res.json({applications:db.prepare("SELECT a.*,s.name service_name,u.name user_name FROM applications a JOIN services s ON s.id=a.service_id JOIN users u ON u.id=a.user_id ORDER BY a.id DESC").all()}));
app.patch("/api/admin/applications/:id/status",auth,admin,(req,res)=>{
 const allowed=["Submitted","Under Review","Processing","Completed","Rejected"],s=req.body.status;if(!allowed.includes(s))return res.status(400).json({error:"Invalid status"});
 const a=db.prepare("SELECT * FROM applications WHERE id=?").get(req.params.id);if(!a)return res.status(404).json({error:"Application not found"});
 db.prepare("UPDATE applications SET status=?,updated_at=? WHERE id=?").run(s,now(),a.id);
 db.prepare("INSERT INTO notifications(user_id,title,message,created_at) VALUES(?,?,?,?)").run(a.user_id,"Application status updated",`Application ${a.reference_id} is now ${s}.`,now());
 res.json({ok:true});
});
app.get("/api/admin/applications/:id/documents",auth,admin,(req,res)=>{
 const docs=db.prepare("SELECT id,original_name,mime_type,size,created_at FROM documents WHERE application_id=?").all(req.params.id);
 res.json({documents:docs.map(d=>({...d,url:`/api/admin/documents/${d.id}`}))});
});
app.get("/api/admin/documents/:id",auth,admin,(req,res)=>{
 const d=db.prepare("SELECT * FROM documents WHERE id=?").get(req.params.id);
 if(!d)return res.status(404).json({error:"Document not found"});
 const full=path.join(UPLOAD_DIR,d.stored_name);
 if(!fs.existsSync(full))return res.status(404).json({error:"Stored file not found"});
 res.setHeader("Content-Type",d.mime_type);
 res.setHeader("Content-Disposition",`attachment; filename="${String(d.original_name).replace(/[^a-zA-Z0-9._ -]/g,"_").slice(0,120)}"`);
 res.sendFile(full);
});
app.get("/api/admin/services",auth,admin,(req,res)=>res.redirect("/api/services"));
app.post("/api/admin/services",auth,admin,(req,res)=>saveService(req,res));
app.put("/api/admin/services/:id",auth,admin,(req,res)=>saveService(req,res,req.params.id));
app.delete("/api/admin/services/:id",auth,admin,(req,res)=>{
 const used=db.prepare("SELECT COUNT(*) c FROM applications WHERE service_id=?").get(req.params.id).c;
 if(used) return res.status(409).json({error:"This service has applications and cannot be deleted. Mark it unavailable instead."});
 db.prepare("DELETE FROM services WHERE id=?").run(req.params.id);res.json({ok:true});
});
function saveService(req,res,id=null){const {name,description,required_documents=[],processing_info="",fee_display="",available=true}=req.body,t=now();if(!name||!description)return res.status(400).json({error:"Name and description are required"});if(id){db.prepare("UPDATE services SET name=?,description=?,required_documents=?,processing_info=?,fee_display=?,available=?,updated_at=? WHERE id=?").run(name,description,JSON.stringify(required_documents),processing_info,fee_display,available?1:0,t,id)}else db.prepare("INSERT INTO services(name,description,required_documents,processing_info,fee_display,available,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(name,description,JSON.stringify(required_documents),processing_info,fee_display,available?1:0,t,t);res.json({ok:true})}
app.get("/api/admin/announcements",auth,admin,(req,res)=>res.json({announcements:db.prepare("SELECT * FROM announcements ORDER BY id DESC").all()}));
app.post("/api/admin/announcements",auth,admin,(req,res)=>{if(!req.body.title||!req.body.message)return res.status(400).json({error:"Title and message required"});db.prepare("INSERT INTO announcements(title,message,created_at) VALUES(?,?,?)").run(req.body.title,req.body.message,now());res.json({ok:true})});

app.get("/api/admin/users",auth,admin,(req,res)=>res.json({users:db.prepare("SELECT id,name,email,mobile,role,created_at FROM users ORDER BY id DESC").all()}));
app.get("/api/admin/settings",auth,admin,(req,res)=>{
 const rows=db.prepare("SELECT key,value FROM settings").all(); const settings=Object.fromEntries(rows.map(x=>[x.key,x.value])); res.json({settings});
});
app.put("/api/admin/settings",auth,admin,(req,res)=>{
 const allowed=["phoneDisplay","phoneLink","whatsappNumber","email","address","mapQuery"];
 const up=db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
 const tx=db.transaction(()=>allowed.forEach(k=>{if(req.body[k]!==undefined)up.run(k,String(req.body[k]))}));tx();res.json({ok:true});
});

app.get("/health",(req,res)=>res.json({ok:true,service:"DHRUVA ONLINE AND STUDIO"}));
app.listen(PORT,"0.0.0.0",()=>console.log(`DHRUVA ONLINE AND STUDIO listening on port ${PORT}`));
