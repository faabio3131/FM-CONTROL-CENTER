import Link from "next/link";
import { CommandMark } from "@/presentation/command-mark";

export default function NotFound() {
  return (
    <main className="command-not-found">
      <section className="card">
        <div style={{ width: 44, height: 44, margin: "0 auto 18px" }}>
          <CommandMark gradientId="command-not-found-gradient" />
        </div>
        <p className="command-not-found-code">404</p>
        <h1>Página não encontrada</h1>
        <p>O endereço pode ter mudado ou você não tem acesso a esta área do FM Command.</p>
        <div className="actions" style={{ justifyContent: "center" }}>
          <Link className="button primary" href="/dashboard">Voltar ao Command</Link>
        </div>
      </section>
    </main>
  );
}
