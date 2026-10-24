export interface DeploymentIdentity {
  readonly service: "fm-control-center";
  readonly environment: "render" | "contabo" | "unknown";
  readonly gitCommit: string | null;
  readonly gitBranch: string | null;
}

// "contabo" só é reconhecido quando declarado explicitamente (FMCC_DEPLOY_TARGET=contabo no .env do servidor);
// nada é inferido do hostname ou de outras variáveis.
function resolveEnvironment(): DeploymentIdentity["environment"] {
  if (process.env.RENDER === "true") return "render";
  if (process.env.FMCC_DEPLOY_TARGET?.trim() === "contabo") return "contabo";
  return "unknown";
}

export function readDeploymentIdentity(): DeploymentIdentity {
  return {
    service: "fm-control-center",
    environment: resolveEnvironment(),
    gitCommit: process.env.RENDER_GIT_COMMIT?.trim() || null,
    gitBranch: process.env.RENDER_GIT_BRANCH?.trim() || null,
  };
}

export function deploymentEnvironmentLabel(
  identity: DeploymentIdentity,
): string {
  if (identity.environment === "contabo") return "Contabo · produção";
  if (identity.environment !== "render") return "Ambiente não identificado";
  return identity.gitBranch
    ? "Render · " + identity.gitBranch
    : "Render";
}
