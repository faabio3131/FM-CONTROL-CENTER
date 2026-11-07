import {
  NfcoreCognitiveConnector,
  type NfcoreSecretResolver,
} from "@/infrastructure/integration/nfcore-cognitive-connector";
import {
  NfcoreCommercialConnector,
  type NfcoreCommercialSecretResolver,
} from "@/infrastructure/integration/nfcore-commercial-connector";
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
import {
  IronCommercialConnector,
  type IronSecretResolver,
} from "@/infrastructure/integration/iron-commercial-connector";

import { IronUsageConnector } from "@/infrastructure/integration/iron-usage-connector";
import { NfcoreOperationalUsageConnector } from "@/infrastructure/integration/nfcore-operational-usage-connector";

export function buildConnectorRuntime(input?: {
  resolveSecret?: SecretResolver & IronSecretResolver & NfcoreSecretResolver & NfcoreCommercialSecretResolver;
  fetcher?: typeof fetch;
}) {
  const connector = new KordenaCommercialConnector(
    input?.resolveSecret,
    input?.fetcher,
  );
  const ironConnector = new IronCommercialConnector(
    input?.resolveSecret,
    input?.fetcher,
  );
  const nfcoreConnector = new NfcoreCognitiveConnector(input?.resolveSecret, input?.fetcher);
  const nfcoreCommercialConnector = new NfcoreCommercialConnector(input?.resolveSecret, input?.fetcher);
  return new ConnectorRuntime(
    new PostgresSourceRepository(),
    new PostgresSyncRepository(),
    new PostgresCanonicalFactRepository(),
    [connector, ironConnector, nfcoreConnector, nfcoreCommercialConnector, new IronUsageConnector(), new NfcoreOperationalUsageConnector()],
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

export function buildIronCommercialConnector(input?: {
  resolveSecret?: IronSecretResolver;
  fetcher?: typeof fetch;
}) {
  return new IronCommercialConnector(
    input?.resolveSecret,
    input?.fetcher,
  );
}

export function buildNfcoreCognitiveConnector(input?: {
  resolveSecret?: NfcoreSecretResolver;
  fetcher?: typeof fetch;
}) {
  return new NfcoreCognitiveConnector(input?.resolveSecret, input?.fetcher);
}

export function buildNfcoreCommercialConnector(input?: {
  resolveSecret?: NfcoreCommercialSecretResolver;
  fetcher?: typeof fetch;
}) {
  return new NfcoreCommercialConnector(input?.resolveSecret, input?.fetcher);
}

export function buildIronUsageConnector() { return new IronUsageConnector(); }
export function buildNfcoreOperationalUsageConnector() { return new NfcoreOperationalUsageConnector(); }
