#!/usr/bin/env bash
# Teste sintético das regras de migração do deploy-app. Não precisa de servidor, sudo nem Docker.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CMD_LIB_ONLY=1
# shellcheck source=/dev/null
source "$DIR/deploy-app"
R="$(mktemp -d)"; trap 'rm -rf "$R"' EXIT
g() { git -C "$R" -c user.email=t@t -c user.name=t "$@"; }
git -C "$R" init -q; mkdir -p "$R/drizzle/meta"
echo "CREATE TABLE a(i int);" >"$R/drizzle/0000_a.sql"; echo '{}' >"$R/drizzle/meta/_journal.json"; g add -A; g commit -qm 1
echo "ALTER TABLE a ADD COLUMN b int;" >"$R/drizzle/0001_b.sql"; echo '{"x":1}' >"$R/drizzle/meta/_journal.json"; g add -A; g commit -qm 2
echo "ALTER TABLE a DROP COLUMN b;" >"$R/drizzle/0002_c.sql"; g add -A; g commit -qm 3
g rm -q -f drizzle/0002_c.sql; echo "ALTER TABLE a ADD COLUMN z int;" >>"$R/drizzle/0001_b.sql"; g add -A; g commit -qm 4
[[ "$(count_new_migrations "$R" HEAD~3 HEAD~2)" == 1 ]] || { echo "contagem de migracoes novas errada" >&2; exit 1; }
scan_migrations "$R" HEAD~3 HEAD~2 >/dev/null || { echo "migracao aditiva foi recusada" >&2; exit 1; }
if scan_migrations "$R" HEAD~2 HEAD~1 >/dev/null; then echo "DROP COLUMN nao foi recusado" >&2; exit 1; fi
if scan_migrations "$R" HEAD~2 HEAD >/dev/null; then echo "alteracao de migracao antiga nao foi recusada" >&2; exit 1; fi
echo "deploy-app: migracao aditiva aceita; DROP COLUMN e alteracao de migracao antiga recusados."
