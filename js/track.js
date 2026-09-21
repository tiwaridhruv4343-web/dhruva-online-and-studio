const $=s=>document.querySelector(s);
$("#trackForm").onsubmit=async e=>{
 e.preventDefault(); const value=$("#trackValue").value.trim(); const msg=$("#trackMessage"); msg.textContent="Searching…";
 try{
  const r=await fetch(`/api/track?value=${encodeURIComponent(value)}`); const d=await r.json(); if(!r.ok)throw Error(d.error);
  msg.textContent="";
  const timeline=["Submitted","Under Review","Processing","Completed","Rejected"]; const current=d.application.status;
  $("#trackResult").classList.remove("hidden"); $("#trackResult").innerHTML=`<div class="track-summary"><span class="eyebrow">REFERENCE</span><h2>${esc(d.application.reference_id)}</h2><p>${esc(d.application.service_name)}</p><span class="status status-${current.toLowerCase().replaceAll(" ","-")}">${esc(current)}</span></div><div class="timeline">${timeline.map((s,i)=>`<div class="timeline-item ${s===current?"active":""} ${timeline.indexOf(current)>=i&&current!=="Rejected"?"done":""}"><b>${i+1}</b><div><strong>${s}</strong><small>${s===current?"Current status":""}</small></div></div>`).join("")}</div><div class="track-meta"><span>Submitted<strong>${new Date(d.application.created_at).toLocaleString()}</strong></span><span>Last updated<strong>${new Date(d.application.updated_at).toLocaleString()}</strong></span></div>`;
 }catch(err){$("#trackResult").classList.add("hidden");msg.textContent=err.message}
};
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}