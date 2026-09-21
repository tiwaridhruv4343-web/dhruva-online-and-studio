require("dotenv").config();
const readline=require("readline"),bcrypt=require("bcryptjs"),Database=require("better-sqlite3"),path=require("path");
const db=new Database(path.join(__dirname,"data","dhruva.sqlite"));
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
const ask=q=>new Promise(r=>rl.question(q,r));
(async()=>{
 try{
  const name=await ask("Admin name: "),email=(await ask("Admin email: ")).trim().toLowerCase(),mobile=await ask("Admin mobile: "),password=await ask("Admin password (8+ chars): ");
  if(password.length<8)throw Error("Password must be at least 8 characters.");
  const hash=await bcrypt.hash(password,12),now=new Date().toISOString();
  db.prepare("INSERT INTO users(name,email,mobile,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(name,email,mobile,hash,"admin",now,now);
  console.log("Admin created. Password was stored only as a bcrypt hash.");
 }catch(e){console.error("Could not create admin:",e.message)}finally{rl.close();db.close()}
})();
