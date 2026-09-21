const api=async(url,o={})=>{const r=await fetch(url,{headers:{"Content-Type":"application/json",...(o.headers||{})},...o});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d};const $=s=>document.querySelector(s);let allApps=[];
async function load(){try{const me=await api("/api/auth/me");if(!me.user||me.user.role!=="admin")return location.href="/auth.html";const [stats,apps,services,anns,users,settings,visits]=await Promise.all([api("/api/admin/stats"),api("/api/admin/applications"),api("/api/services"),api("/api/admin/announcements"),api("/api/admin/users"),api("/api/admin/settings"),api("/api/admin/visits")]);$("#aUsers").textContent=stats.users;$("#aApps").textContent=stats.applications;$("#aProcessing").textContent=stats.processing;$("#aCompleted").textContent=stats.completed;allApps=apps.applications;renderApps();renderServices(services.services);renderAnnouncements(anns.announcements);renderUsers(users.users);renderSettings(settings.settings);renderVisits(visits)}catch(e){location.href="/auth.html"}}
function renderVisits(data){
  $("#aVisits").textContent=data.totals.visits||0;
  $("#aUniqueVisitors").textContent=data.totals.unique_visitors||0;
  $("#aTodayVisits").textContent=data.today.visits||0;
  $("#aTodayUnique").textContent=data.today.unique_visitors||0;
  $("#adminVisits").innerHTML=(data.recent||[]).map(v=>`<tr><td><b>${esc(v.visitor_id.slice(0,10))}…</b></td><td>${esc(v.path)}</td><td>${esc(v.device)}</td><td>${esc(v.referrer||"Direct")}</td><td>${fmt(v.created_at)}</td></tr>`).join("")||`<tr><td colspan="5">No visits recorded yet.</td></tr>`;
}
function renderApps(){const q=$("#search").value.toLowerCase(),st=$("#statusFilter").value;$("#adminApps").innerHTML=allApps.filter(a=>(!q||[a.reference_id,a.mobile,a.service_name,a.user_name].join(" ").toLowerCase().includes(q))&&(!st||a.status===st)).map(a=>`<tr><td><b>${esc(a.reference_id)}</b></td><td>${esc(a.user_name)}<br><small>${esc(a.mobile)}</small></td><td>${esc(a.service_name)}</td><td><select class="status-select" data-id="${a.id}">${["Submitted","Under Review","Processing","Completed","Rejected"].map(s=>`<option ${s===a.status?"selected":""}>${s}</option>`).join("")}</select></td><td>${fmt(a.updated_at)}</td><td><button class="doc-link" data-docs="${a.id}">Documents</button></td></tr>`).join("")||`<tr><td colspan="6">No matching applications.</td></tr>`;document.querySelectorAll(".status-select").forEach(x=>x.onchange=async()=>{await api(`/api/admin/applications/${x.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:x.value})});load()})}
function renderUsers(list){$("#adminUsers").innerHTML=list.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.mobile)}</td><td>${fmt(u.created_at)}</td></tr>`).join("")||`<tr><td colspan="4">No users.</td></tr>`}
function renderSettings(s){$("#setPhoneDisplay").value=s.phoneDisplay||"";$("#setPhoneLink").value=s.phoneLink||"";$("#setWhatsapp").value=s.whatsappNumber||"";$("#setEmail").value=s.email||"";$("#setAddress").value=s.address||"";$("#setMap").value=s.mapQuery||""}
function renderServices(list){$("#serviceList").innerHTML=list.map(s=>`<div class="admin-item"><div><b>${esc(s.name)}</b><small>${esc(s.fee_display||"No fee display")} • ${s.available?"Available":"Unavailable"}</small></div><span><button data-edit="${s.id}">Edit</button> <button data-delete="${s.id}">Delete</button></span></div>`).join("");document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{const s=list.find(x=>x.id==b.dataset.edit);$("#serviceId").value=s.id;$("#serviceName").value=s.name;$("#serviceDescription").value=s.description;$("#serviceDocs").value=s.required_documents.join(", ");$("#serviceProcess").value=s.processing_info;$("#serviceFee").value=s.fee_display||"";$("#serviceAvailability").value=String(!!s.available)})}
function renderAnnouncements(list){$("#announcementList").innerHTML=list.map(a=>`<div class="admin-item"><div><b>${esc(a.title)}</b><small>${esc(a.message)}</small></div></div>`).join("")}
$("#search").oninput=renderApps;$("#statusFilter").onchange=renderApps;
$("#adminLogout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});location.href="/index.html"};
$("#serviceForm").onsubmit=async e=>{e.preventDefault();const body={name:$("#serviceName").value,description:$("#serviceDescription").value,required_documents:$("#serviceDocs").value.split(",").map(x=>x.trim()).filter(Boolean),processing_info:$("#serviceProcess").value,fee_display:$("#serviceFee").value,available:$("#serviceAvailability").value==="true"};const id=$("#serviceId").value;await api(id?`/api/admin/services/${id}`:"/api/admin/services",{method:id?"PUT":"POST",body:JSON.stringify(body)});e.target.reset();$("#serviceId").value="";load()};
$("#announcementForm").onsubmit=async e=>{e.preventDefault();await api("/api/admin/announcements",{method:"POST",body:JSON.stringify({title:$("#announcementTitle").value,message:$("#announcementMessage").value})});e.target.reset();load()};
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}function fmt(v){return new Date(v).toLocaleString()}load();
document.addEventListener("click",async e=>{
 const del=e.target.closest("[data-delete]"); if(!del)return;
 if(!confirm("Delete this service? Services used by applications cannot be deleted."))return;
 try{await api(`/api/admin/services/${del.dataset.delete}`,{method:"DELETE"});load()}catch(err){alert(err.message)}
});
$("#settingsForm").onsubmit=async e=>{e.preventDefault();await api("/api/admin/settings",{method:"PUT",body:JSON.stringify({phoneDisplay:$("#setPhoneDisplay").value,phoneLink:$("#setPhoneLink").value,whatsappNumber:$("#setWhatsapp").value,email:$("#setEmail").value,address:$("#setAddress").value,mapQuery:$("#setMap").value})});alert("Contact settings saved.")};

document.addEventListener("click",async e=>{
 const b=e.target.closest("[data-docs]");if(!b)return;
 try{const d=await api(`/api/admin/applications/${b.dataset.docs}/documents`);if(!d.documents.length)return alert("No documents uploaded.");
   const lines=d.documents.map(x=>`${x.original_name} — ${Math.round(x.size/1024)} KB — ${location.origin}${x.url}`).join("\n");
   alert("Private document links (admin session required):\n\n"+lines);
 }catch(err){alert(err.message)}
});
