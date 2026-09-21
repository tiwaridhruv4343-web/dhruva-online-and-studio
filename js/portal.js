const api=async(url,o={})=>{const r=await fetch(url,{headers:{"Content-Type":"application/json",...(o.headers||{})},...o});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d};
const $=s=>document.querySelector(s);
async function load(){
 try{
  const me=await api("/api/auth/me"); if(!me.user) return location.href="/auth.html";
  $("#welcome").textContent=`Welcome, ${me.user.name}`; $("#portalWhatsApp").href=`https://wa.me/${SITE_CONFIG.contact.whatsappNumber}?text=${encodeURIComponent("Hello DHRUVA ONLINE AND STUDIO, I need assistance with my account/application.")}`;
  $("#profileBox").innerHTML=`<div class="profile-line"><span>Name</span><b>${esc(me.user.name)}</b></div><div class="profile-line"><span>Email</span><b>${esc(me.user.email)}</b></div><div class="profile-line"><span>Mobile</span><b>${esc(me.user.mobile||"—")}</b></div>`;
  const [services,apps,notes]=await Promise.all([api("/api/services"),api("/api/applications"),api("/api/notifications")]);
  $("#portalServices").innerHTML=services.services.filter(s=>s.available).map(s=>`<article class="service-card"><div class="service-icon">✦</div><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p><small class="fee">${esc(s.fee_display||"Fee: As applicable")}</small><button class="btn btn-primary service-apply" data-id="${s.id}">Apply <span>→</span></button></article>`).join("");
  $("#applicationsBody").innerHTML=apps.applications.length?apps.applications.map(a=>`<tr><td><b>${esc(a.reference_id)}</b></td><td>${esc(a.service_name)}</td><td><span class="status status-${a.status.toLowerCase().replaceAll(" ","-")}">${esc(a.status)}</span></td><td>${fmt(a.created_at)}</td><td>${fmt(a.updated_at)}</td></tr>`).join(""):`<tr><td colspan="5">No applications yet.</td></tr>`;
  $("#statApps").textContent=apps.applications.length; $("#statProcessing").textContent=apps.applications.filter(a=>["Under Review","Processing"].includes(a.status)).length; $("#statCompleted").textContent=apps.applications.filter(a=>a.status==="Completed").length; $("#statNotifications").textContent=notes.notifications.length;
  $("#notificationsBox").innerHTML=notes.notifications.length?notes.notifications.map(n=>`<div class="notice"><b>${esc(n.title)}</b><p>${esc(n.message)}</p><small>${fmt(n.created_at)}</small></div>`).join(""):"<p>No notifications yet.</p>";
  window.portalServices=services.services;
  document.querySelectorAll(".service-apply").forEach(b=>b.onclick=()=>openBooking(b.dataset.id));
 }catch(e){location.href="/auth.html"}
}
function openBooking(id){const s=window.portalServices.find(x=>x.id==id); if(!s)return; $("#bookingTitle").textContent=s.name;$("#bookingDescription").textContent=s.description;$("#bookingServiceId").value=id;$("#bookingMessage").textContent="";$("#bookingModal").classList.add("open");}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function fmt(v){return new Date(v).toLocaleString()}
document.addEventListener("click",e=>{if(e.target.matches("[data-close]"))$("#bookingModal").classList.remove("open")});
$("#logoutBtn").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});location.href="/index.html"};
$("#bookingForm").onsubmit=async e=>{
 e.preventDefault(); const files=[...$("#documents").files]; const msg=$("#bookingMessage"); msg.textContent="Submitting…";
 if(files.length>5||files.some(f=>f.size>5*1024*1024||!["application/pdf","image/jpeg","image/png"].includes(f.type)))return msg.textContent="Only PDF/JPG/JPEG/PNG files up to 5 MB each are allowed.";
 const fd=new FormData();fd.append("service_id",$("#bookingServiceId").value);fd.append("full_name",$("#fullName").value);fd.append("mobile",$("#mobile").value);fd.append("details",$("#details").value);files.forEach(f=>fd.append("documents",f));
 try{const r=await fetch("/api/applications",{method:"POST",body:fd});const d=await r.json();if(!r.ok)throw Error(d.error);msg.textContent=`Submitted. Reference ID: ${d.reference_id}`;e.target.reset();setTimeout(load,500);}catch(err){msg.textContent=err.message}
};
load();