/**
 * Asaas integration foundation. No payment issuance or production credentials.
 * Docs: https://docs.asaas.com/docs/sandbox
 */
export type AsaasEnvironment = "sandbox" | "production";
const BASE_URLS: Readonly<Record<AsaasEnvironment,string>> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};
export function asaasBaseUrl(environment: AsaasEnvironment): string {
  if (environment !== "sandbox" && environment !== "production") throw new Error("asaas.invalid_environment");
  return BASE_URLS[environment];
}
export function buildAsaasReadOnlyRequest(
  environment: AsaasEnvironment, path: "myAccount" | "payments",
  apiKey: string,
): {url:string; init:RequestInit} {
  if (!apiKey || apiKey.trim() !== apiKey || /\s/.test(apiKey)) throw new Error("asaas.invalid_api_key");
  const resource = path === "myAccount" ? "/myAccount" : path === "payments" ? "/payments" : null;
  if (!resource) throw new Error("asaas.invalid_resource");
  return {
    url: `${asaasBaseUrl(environment)}${resource}`,
    init: {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      headers: { "accept":"application/json", "access_token":apiKey, "User-Agent":"FM-Command/0.1" },
    },
  };
}
/** No Asaas request is allowed before the gateway account is explicitly verified. */
export function assertAsaasSandboxOnly(environment: AsaasEnvironment): void {
  if (environment !== "sandbox") throw new Error("asaas.production_not_approved");
}
