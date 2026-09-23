import { ConnectorRuntime } from "@/application/integration/connector-runtime";
import {
  PostgresCanonicalFactRepository,
  PostgresSourceRepository,
  PostgresSyncRepository,
} from "@/infrastructure/integration/postgres-repositories";
import {
  KordenaCommercialConnector,
  type SecretResolver,
} from "@/infrastructure/integration/kordena-commercial-connector";

export function buildConnectorRuntime(input?: {
  resolveSecret?: SecretResolver;
  fetcher?: typeof fetch;
}) {
  const connector = new KordenaCommercialConnector(
    input?.resolveSecret,
    input?.fetcher,
  );
  return new ConnectorRuntime(
    new PostgresSourceRepository(),
    new PostgresSyncRepository(),
    new PostgresCanonicalFactRepository(),
    [connector],
  );
}

export function buildKordenaCommercialConnector(input?: {
  resolveSecret?: SecretResolver;
  fetcher?: typeof fetch;
}) {
  return new KordenaCommercialConnector(
    input?.resolveSecret,
    input?.fetcher,
  );
}
