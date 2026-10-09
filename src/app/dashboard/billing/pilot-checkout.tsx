"use client";

import { useEffect, useState } from "react";

type Pilot = {
  product: string;
  value: string;
  currency: string;
  invoiceStatus: string;
  gatewayReady: boolean;
  existingPayment: boolean;
  canCreatePayment: boolean;
  reason: string;
};
export function PilotCheckout() {
  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/billing/checkout/pilot", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Fatura indisponível para a organização atual.");
        return response.json() as Promise<Pilot>;
      })
      .then(data => { if (active) setPilot(data); })
      .catch(() => { if (active) setFailure("Não foi possível validar o checkout. Confirme o acesso administrativo e a organização Nova FM Tecnologia."); });
    return () => { active = false; };
  }, []);
  return (
    <section className="panel" aria-label="Compra de teste Kordena">
      <h2>Compra de teste — Kordena</h2>
      <p>Teste controlado da integração comercial FM Command → Asaas.</p>
      {failure && <p role="alert">{failure}</p>}
      {!failure && !pilot && <p>Verificando fatura e permissões...</p>}
      {pilot && <>
        <p><strong>{pilot.product}</strong> · Licença de teste</p>
        <p><strong>R$ {pilot.value.replace(".", ",")}</strong></p>
        <p>Forma de pagamento: Pix</p>
        <p>Fatura: {pilot.invoiceStatus === "pending" ? "Aguardando pagamento" : pilot.invoiceStatus}</p>
        <p>Gateway: {pilot.gatewayReady ? "Habilitado" : "Desabilitado para segurança"}</p>
        <p>{pilot.existingPayment ? "Há registro de pagamento; nova emissão bloqueada." : "Nenhuma cobrança registrada nesta fatura."}</p>
        <button className="button primary" type="button" disabled={!pilot.canCreatePayment}>
          Gerar Pix de R$ 1,00
        </button>
        <p role="status">Emissão temporariamente bloqueada até homologar cadastro automático do comprador, QR Code, conciliação e autorização de produção.</p>
      </>}
    </section>
  );
}
