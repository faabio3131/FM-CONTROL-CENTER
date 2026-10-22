#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

cat > "$temp_dir/npm" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == "audit --omit=dev --audit-level=high --fetch-retries=0 --fetch-timeout=45000" ]] || exit 20
n=0
[[ ! -f "$TEST_AUDIT_CALLS" ]] || n="$(cat "$TEST_AUDIT_CALLS")"
n=$((n + 1))
echo "$n" > "$TEST_AUDIT_CALLS"
case "$TEST_AUDIT_MODE" in
  clean) echo "found 0 vulnerabilities" ;;
  vulnerable) echo "1 high severity vulnerability"; exit 1 ;;
  mixed) echo "1 high severity vulnerability"; echo "npm error audit endpoint returned an error"; exit 1 ;;
  recover) if (( n == 1 )); then echo "npm error audit endpoint returned an error"; exit 1; fi
    echo "found 0 vulnerabilities" ;;
  offline) echo "npm error audit endpoint returned an error"; exit 1 ;;
  *) exit 30 ;;
esac
MOCK
cat > "$temp_dir/sleep" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
chmod +x "$temp_dir/npm" "$temp_dir/sleep"
export PATH="$temp_dir:$PATH"
export TEST_AUDIT_CALLS="$temp_dir/calls"

run_case(){
  local mode="$1" expected_exit="$2" expected_calls="$3" result=0
  export TEST_AUDIT_MODE="$mode"
  rm -f "$TEST_AUDIT_CALLS"
  bash "$repo_root/scripts/runtime-dependency-audit.sh" >"$temp_dir/output" 2>&1 || result=$?
  [[ "$result" == "$expected_exit" ]] || { cat "$temp_dir/output"; echo "Bad status for $mode: $result" >&2; exit 1; }
  [[ "$(cat "$TEST_AUDIT_CALLS")" == "$expected_calls" ]] || { cat "$temp_dir/output"; echo "Bad attempts for $mode" >&2; exit 1; }
}

run_case clean 0 1
run_case vulnerable 1 1
run_case mixed 1 1
run_case recover 0 2
run_case offline 1 3
echo "Runtime dependency audit retry/fail-closed tests PASS"
