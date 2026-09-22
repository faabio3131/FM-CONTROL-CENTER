"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ProductCreateForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const slug = String(form.get("slug") ?? "").trim();
    if (!name || !slug) return;

    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error ?? "Não foi possível cadastrar o produto.");
        return;
      }
      event.currentTarget.reset();
      setStatus("idle");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Não foi possível cadastrar o produto.");
    }
  }

  return (
    <form className="product-create-form" onSubmit={submit}>
      <label>Produto<input name="name" required minLength={2} maxLength={120} autoComplete="off" placeholder="Ex.: Kordena" /></label>
      <label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" autoComplete="off" placeholder="kordena" /></label>
      <button className="button" type="submit" disabled={status === "saving"}>{status === "saving" ? "Salvando…" : "Cadastrar produto"}</button>
      {status === "error" ? <small className="error">{message}</small> : null}
    </form>
  );
}
