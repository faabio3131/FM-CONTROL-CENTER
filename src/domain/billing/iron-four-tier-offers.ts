/**
 * Reviewed rollout PROPOSAL, copied from IRON's
 * config/commercial/iron-four-tiers-2026.candidate.json at
 * 69c8c1936e2e18f7329725c784d12dcdaa867ae1.
 * Never used as checkout or pricing authority: the operator approves all
 * eight exact prices before they are written to the existing Command ledger.
 */
export const IRON_FOUR_TIER_PROPOSAL = [
  {tier:"IRON_START",name:"Start",monthly:14700,yearly:142800},
  {tier:"IRON_GROWTH",name:"Growth",monthly:29700,yearly:296400},
  {tier:"IRON_SCALE",name:"Scale",monthly:49700,yearly:500400},
  {tier:"IRON_ENTERPRISE",name:"Enterprise",monthly:89700,yearly:896400},
] as const;

export const IRON_FOUR_TIER_REVIEW_VERSION = "iron-four-tiers-2026-v1";
export const IRON_FOUR_TIER_APPROVAL = "PUBLICAR_8_OFERTAS";
export const IRON_FOUR_TIER_OFFERS = IRON_FOUR_TIER_PROPOSAL.flatMap(tier =>
  (["monthly","yearly"] as const).map(interval=>({
    commercialPlanCode:tier.tier+(interval==="monthly"?"_M_2026":"_Y_2026"),
    ironPlanCode:tier.tier,ironPlanVersion:1,
    amountMinor:tier[interval],interval,
    name:"IRON "+tier.name+(interval==="monthly"?" mensal":" anual"),
  })));
