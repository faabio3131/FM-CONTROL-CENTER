"use client";
import { FormEvent,useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/infrastructure/auth/auth-client";
export default function OnboardingPage(){
  const router=useRouter(); const [message,setMessage]=useState<string|null>(null); const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setBusy(true); setMessage(null);
    const form=new FormData(event.currentTarget); const name=String(form.get("name")??"").trim(); const slug=String(form.get("slug")??"").trim().toLowerCase();
    try { const result=await authClient.organization.create({name,slug,keepCurrentActiveOrganization:false}); if(result.error){setMessage(result.error.message??"Não foi possível criar a organização.");return;} router.push("/dashboard"); router.refresh(); } finally {setBusy(false);}
  }
  return <main className="shell"><section className="card auth-card"><span className="eyebrow">Tenant</span><h1>Criar organização</h1><p>A organização autenticada é a raiz de isolamento de dados do Control Center.</p><form onSubmit={submit}><label>Nome da organização<input name="name" required minLength={2}/></label><label>Identificador<input name="slug" required pattern="[a-z0-9-]+"/></label><button className="button primary" disabled={busy} type="submit">{busy?"Criando…":"Criar organização"}</button></form>{message&&<p role="alert" className="error">{message}</p>}</section></main>
}
