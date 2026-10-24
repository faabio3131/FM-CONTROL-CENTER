#!/usr/bin/env bash
# Purely synthetic SSH gate tests. No server, sudo privilege or Docker required.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
cat >"$TEMP/sudo" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*"
EOF
chmod 700 "$TEMP/sudo"
SHA="$(printf 'a%.0s' {1..40})"
expect="$("$TEMP/sudo" -n -u fmadmin /opt/fm/bin/deploy-app command "$SHA")"
actual="$(env PATH="$TEMP:$PATH" SSH_ORIGINAL_COMMAND="deploy command $SHA" bash "$DIR/deploy-gate")"
[[ "$actual" == "$expect" ]] || { echo "valid gate did not forward exact arguments" >&2; exit 1; }

bad=(
  ""
  "ls"
  "deploy shell $SHA"
  "deploy other $SHA"
  "deploy command a"
  "deploy command ${SHA} --extra"
  "deploy command ${SHA};id"
  "deploy  command ${SHA}"
  "deploy command ${SHA} "
  "deploy command ${SHA}"$'\n''echo injected'
  "deploy command ${SHA}"$'\r'
  "deploy command $(id)"
)
for input in "${bad[@]}"; do
  if env PATH="$TEMP:$PATH" SSH_ORIGINAL_COMMAND="$input" \
    bash "$DIR/deploy-gate" >"$TEMP/out" 2>"$TEMP/err"; then
    echo "gate accepted malformed/injected command" >&2
    exit 1
  fi
  [[ ! -s "$TEMP/out" ]] || { echo "gate unexpectedly executed the sudo stub" >&2; exit 1; }
done
echo "Contabo SSH gate: valid command forwarded; ${#bad[@]} hostile commands rejected."
