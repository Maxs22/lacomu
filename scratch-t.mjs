import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env={}; for(const l of readFileSync(".env.local","utf8").split("\n")){const t=l.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i===-1)continue;env[t.slice(0,i)]=t.slice(i+1);}
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const {data:u}=await admin.auth.admin.createUser({email:`t-redir-${Date.now()}@lacomu.ar`,email_confirm:true});
const {data:p}=await admin.from("profiles").select("handle").eq("id",u.user.id).single();
const {data:app}=await admin.from("campaign_applications").insert({applicant_id:u.user.id,title:"Necesito un taladro",description:"x",goal_amount:1000}).select("id").single();
const {data:c}=await admin.from("campaigns").select("id, slug").eq("application_id",app.id).single();
console.log(JSON.stringify({userId:u.user.id, handle:p.handle, campaignId:c.id, slug:c.slug}));
