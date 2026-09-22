"use client";
import { FormEvent,useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/infrastructure/auth/auth-client";
export default function SignInPage(){
  const router=useRouter(); const [mode,setMode]=useState<"sign-in"|"sign-up">("sign-in"); const [message,setMessage]=useState<string|null>(null); const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setBusy(true); setMessage(null);
    const form=new FormData(event.currentTarget); const email=String(form.get("email")??"").trim(); const password=String(form.get("password")??""); const name=String(form.get("name")??"").trim();
    try {
      const result=mode==="sign-up"?await authClient.signUp.email({name,email,password}):await authClient.signIn.email({email,password});
      if(result.error){setMessage(mode==="sign-in"?"Não foi possível entrar. Verifique suas credenciais.":"Não foi possível criar a conta.");return;}
      router.push(mode==="sign-up"?"/onboarding":"/dashboard"); router.refresh();
    } finally {setBusy(false);}
  }
  return <main className="shell"><section className="card auth-card"><span className="eyebrow">Acesso seguro</span><h1>{mode==="sign-in"?"Entrar":"Criar conta"}</h1><form onSubmit={submit}>{mode==="sign-up"&&<label>Nome<input name="name" required minLength={2} autoComplete="name"/></label>}<label>E-mail<input name="email" required type="email" autoComplete="email"/></label><label>Senha<input name="password" required type="password" minLength={8} autoComplete={mode==="sign-up"?"new-password":"current-password"}/></label><button className="button primary" disabled={busy} type="submit">{busy?"Processando…":mode==="sign-in"?"Entrar":"Criar conta"}</button></form>{message&&<p role="alert" className="error">{message}</p>}<button className="link-button" type="button" onClick={()=>setMode(mode==="sign-in"?"sign-up":"sign-in")}>{mode==="sign-in"?"Criar uma conta":"Já tenho uma conta"}</button></section></main>
}
