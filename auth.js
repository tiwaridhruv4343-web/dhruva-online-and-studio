const api = async (url, options={}) => {
  const res = await fetch(url, {headers: {"Content-Type":"application/json", ...(options.headers||{})}, ...options});
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};
let registerMode = new URLSearchParams(location.search).get("mode") === "register";
const title=$("#authTitle"), sub=$("#authSubtitle"), submit=$("#authSubmit"), nameField=$("#nameField"), confirmField=$("#confirmField"), mobileLabel=$("#mobileLabel"), toggle=$("#toggleMode");
function $(s){return document.querySelector(s)}
function render(){
  registerMode=!!registerMode;
  title.textContent=registerMode?"Create account":"Sign in";
  sub.textContent=registerMode?"Register for your DHRUVA ONLINE AND STUDIO portal account.":"Access your DHRUVA ONLINE AND STUDIO dashboard.";
  submit.innerHTML=registerMode?"Create account <span>→</span>":"Sign in <span>→</span>";
  nameField.classList.toggle("hidden-field",!registerMode); confirmField.classList.toggle("hidden-field",!registerMode);
  document.querySelector("#mobileLabel").classList.toggle("hidden-field",!registerMode);
  toggle.textContent=registerMode?"Already have an account? Sign in":"Create an account";
}
toggle.onclick=()=>{location.search=registerMode?"":"?mode=register"};
render();
$("#authForm").onsubmit=async e=>{
 e.preventDefault(); const msg=$("#authMessage"); msg.textContent="Please wait…";
 try{
  const body=registerMode?{name:$("#name").value,email:$("#email").value,mobile:$("#mobile").value,password:$("#password").value,confirmPassword:$("#confirm").value}:{email:$("#email").value,password:$("#password").value};
  const data=await api(registerMode?"/api/auth/register":"/api/auth/login",{method:"POST",body:JSON.stringify(body)});
  location.href=data.role==="admin"?"/admin.html":"/portal.html";
 }catch(err){msg.textContent=err.message}
};
$("#forgotBtn").onclick=async()=>{
 const email=$("#email").value.trim(); if(!email) return $("#authMessage").textContent="Enter your email first.";
 try{const d=await api("/api/auth/forgot",{method:"POST",body:JSON.stringify({email})}); $("#authMessage").textContent=d.message;}catch(e){$("#authMessage").textContent=e.message}
};