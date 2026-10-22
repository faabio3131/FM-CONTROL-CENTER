#!/usr/bin/env bash
# Runtime supply-chain gate: never treat registry failures as a clean audit.
# Retry only transient transport/registry errors; confirmed vulnerabilities
# remain immediate failures. No --force, --offline or audit bypass.
set -euo pipefail

for attempt in 1 2 3; do
  log_file="$(mktemp)"
  if npm audit --omit=dev --audit-level=high --fetch-retries=0 --fetch-timeout=45000 >"$log_file" 2>&1; then
    cat "$log_file"
    rm -f "$log_file"
    echo "Runtime dependency audit verified on attempt $attempt."
    exit 0
  fi

  cat "$log_file"
  # A vulnerability and a transient transport error may coexist in npm output.
  # Never retry a confirmed finding and accidentally accept a later clean response.
  if grep -Eiq '(^|[[:space:]])[1-9][0-9]*[[:space:]]+(high|critical)[[:space:]]+severity|(^|[[:space:]])(high|critical)[[:space:]]+severity[[:space:]]+vulnerabilit' "$log_file"; then
    rm -f "$log_file"
    echo "Runtime dependency audit FAILED: confirmed high/critical advisory." >&2
    exit 1
  fi
  if ! grep -Eiq 'audit network timeout|audit endpoint returned an error|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|FETCH_ERROR|504 Gateway Time-out|502 Bad Gateway|503 Service Unavailable' "$log_file"; then
    rm -f "$log_file"
    echo "Runtime dependency audit FAILED: non-transient failure; no retry." >&2
    exit 1
  fi
  rm -f "$log_file"
  if (( attempt == 3 )); then
    echo "Runtime dependency audit BLOCKED: registry unavailable after 3 attempts; gate remains RED." >&2
    exit 1
  fi
  echo "Transient npm registry failure; retrying the full security audit (attempt $((attempt + 1))/3)..." >&2
  sleep "$((5 * attempt))"
done

exit 1
