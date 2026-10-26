"use client";

import type { BillingProductPlanView } from "@/application/billing/product-billing-authority-service";
import type { IronVersionedPlanMapping } from "@/domain/billing/iron-versioned-plan-mapping";
import { IronCommercialPlanCreateForm } from "./iron-commercial-plan-create-form";
import type { IronPublishedPlanVersion } from "@/infrastructure/integration/iron-commercial-connector";
import { IronPlanVersionBindingForm } from "./iron-plan-version-binding-form";
import { IronCommercialPlanActivationForm } from "./iron-commercial-plan-activation-form";

export function IronCommercialPlansPanel({ productId, plans, mappings, mappingAvailable, canWrite, publishedIronPlans, publishedIronPlansAvailable }: {
  productId: string;
  canWrite: boolean;
  plans: readonly BillingProductPlanView[];
  mappings: readonly IronVersionedPlanMapping[];
  mappingAvailable: boolean;
  publishedIronPlans: readonly IronPublishedPlanVersion[];
  publishedIronPlansAvailable: boolean;
}) {
  return <section className="executive-section" aria-label="Planos comerciais IRON">
    <div className="section-heading">
      <div><span className="eyebrow">FM Tecnologia · Gestão comercial</span><h2>Planos e preços do IRON</h2></div>
      <p>O preço da licença IRON pertence à FM Tecnologia, separado das mensalidades dos alunos.</p>
    </div>
    <div className="panel">
      <h3>Planos comerciais</h3>
      {plans.length === 0 ? <p>Nenhum plano cadastrado.</p> : <div className="foundation-grid">
        {plans.map(plan => <article key={plan.id}>
          <strong>{plan.name}</strong><span>{plan.planCode}</span>
          <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.amountMinor / 100)} · {plan.interval === "monthly" ? "Mensal" : "Anual"}</span>
          <span>{plan.status === "active" ? "Ativo" : "Inativo"}</span>
        </article>)}
      </div>}
    </div>
    <div className="panel">
      <h3>Vínculos de licença versionados</h3>
      {!mappingAvailable ? <p role="status">Fonte IRON indisponível ou ambígua. Nenhum vínculo é presumido.</p> :
        mappings.length === 0 ? <p>Não há planos IRON vinculados a ofertas comerciais.</p> :
        <div className="foundation-grid">{mappings.map(mapping =>
          <article key={mapping.revision}><strong>{mapping.commercialPlanCode}</strong>
            <span>Plano IRON {mapping.ironPlanCode}, versão {mapping.ironPlanVersion}</span>
            <span>Revisão {mapping.revision} · vínculo imutável</span>
          </article>)}</div>}
      <p>Os direitos e limites do IRON continuam sob sua autoridade canônica. Esta tela não concede licença ou altera quota.</p>
    </div>

    <div className="panel">
      <h3>Vincular preço da FM a uma versão publicada do IRON</h3>
      <p>O catálogo de versões vem diretamente do domínio canônico do IRON. Registrar um vínculo não publica preços, ativa uma assinatura ou concede direitos.</p>
      <IronPlanVersionBindingForm
        productId={productId}
        plans={plans}
        mappings={mappings}
        canWrite={canWrite}
        mappingAvailable={mappingAvailable}
        publishedPlans={publishedIronPlans}
        publishedPlansAvailable={publishedIronPlansAvailable}
      />
    </div>
    <div className="panel">
      <h3>Ativar preço comercial após revisão</h3>
      <p>A ativação exige vínculo existente com uma versão publicada do IRON, confirmação explícita e senha administrativa da FM. Não gera cobrança nem licença.</p>
      <IronCommercialPlanActivationForm
        productId={productId}
        plans={plans}
        mappings={mappings}
        canWrite={canWrite}
        mappingAvailable={mappingAvailable}
        publishedPlans={publishedIronPlans}
        publishedPlansAvailable={publishedIronPlansAvailable}
      />
    </div>
    <div className="panel">
      <h3>Novo plano comercial</h3>
      <p>Crie novos preços com códigos exclusivos. O registro começa inativo até completar os vínculos e aprovações.</p>
      <IronCommercialPlanCreateForm productId={productId} existingCodes={plans.map(plan => plan.planCode)} canWrite={canWrite}/>
    </div>
  </section>;
}
