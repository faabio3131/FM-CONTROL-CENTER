#!/usr/bin/env bash
# Instala o caminho de deploy no servidor Contabo. Rodar UMA vez, com sudo, a partir de uma cópia
# deste diretório. Uso: sudo ./install.sh "ssh-ed25519 AAAA... comentario"
# (a chave pública é a da chave de deploy exclusiva; a privada fica só no segredo do GitHub)
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "rode com sudo" >&2; exit 1; }
PUB="${1:-}"
[[ "$PUB" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ [^\"\']*)?$ ]] || {
  echo "passe a chave PUBLICA ed25519 entre aspas como primeiro argumento" >&2; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
COMPOSE=/opt/fm/command/docker-compose.yml
SRC=/opt/fm/command/src
ENVF=/opt/fm/command/.env
BACKUP=/opt/fm/backups/backup-command.sh

# Preflight BEFORE touching accounts, sudoers, compose or the running image.
# The actual server layout is not committed to this repository; reject surprises.
for file in "$COMPOSE" "$ENVF"; do
  [[ -f "$file" ]] || { echo "preflight: missing $file" >&2; exit 3; }
done
[[ -x "$BACKUP" ]] || { echo "preflight: database backup script missing or not executable" >&2; exit 3; }
id fmadmin >/dev/null 2>&1 || { echo "preflight: fmadmin missing" >&2; exit 3; }
git -C "$SRC" rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  { echo "preflight: command source repository missing" >&2; exit 3; }
[[ -z "$(git -C "$SRC" status --porcelain)" ]] ||
  { echo "preflight: source repository has uncommitted changes" >&2; exit 3; }
if ! command -v docker >/dev/null || ! command -v python3 >/dev/null; then
  echo "preflight: docker or python3 missing" >&2
  exit 3
fi
docker info >/dev/null 2>&1 ||
  { echo "preflight: docker engine unavailable" >&2; exit 3; }
# Parse the EFFECTIVE Compose model instead of guessing which service an
# arbitrary "image:" line belongs to. Do not echo Compose configuration/secrets.
IMAGE="$(docker compose -f "$COMPOSE" config --format json |
  python3 -c '
import json, re, sys
try:
    app = json.load(sys.stdin)["services"]["app"]
    image = app["image"]
    if not isinstance(image, str) or re.fullmatch(r"fmcc:[A-Za-z0-9._-]+", image) is None:
        raise ValueError("unexpected image")
    if not app.get("build") or not app.get("healthcheck"):
        raise ValueError("build or healthcheck missing")
    print(image)
except (KeyError, TypeError, ValueError, json.JSONDecodeError):
    sys.exit(3)
')" || { echo "preflight: unsupported Compose app/image/build/healthcheck" >&2; exit 3; }
docker image inspect "$IMAGE" >/dev/null 2>&1 ||
  { echo "preflight: current image missing ($IMAGE)" >&2; exit 3; }
CID="$(docker compose -f "$COMPOSE" ps -q app)" || exit 3
[[ -n "$CID" && "$(docker inspect -f '{{.State.Health.Status}}' "$CID" 2>/dev/null)" == healthy ]] ||
  { echo "preflight: running Command container is not healthy" >&2; exit 3; }
# The image tag must occur literally, exactly once, so editing the YAML cannot
# replace another service by accident.
[[ "$(grep -cE "^[[:space:]]*image:[[:space:]]*${IMAGE}[[:space:]]*$" "$COMPOSE" || true)" == 1 ]] ||
  { echo "preflight: image tag is not a unique literal in Compose" >&2; exit 3; }

mkdir -p /opt/fm/bin
install -o root -g root -m 755 "$HERE/deploy-gate" /opt/fm/bin/deploy-gate
install -o root -g root -m 755 "$HERE/deploy-app"  /opt/fm/bin/deploy-app

if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
passwd -l deploy >/dev/null
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
printf 'restrict,command="/opt/fm/bin/deploy-gate" %s\n' "$PUB" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

TMP="$(mktemp)"
echo 'deploy ALL=(fmadmin) NOPASSWD: /opt/fm/bin/deploy-app command *' > "$TMP"
visudo -cf "$TMP"
install -o root -g root -m 440 "$TMP" /etc/sudoers.d/fm-deploy
rm -f "$TMP"

# A imagem do app passa a ter o nome fixo fmcc:current (permite voltar para fmcc:prev).
if [[ "$IMAGE" != "fmcc:current" ]]; then
  cp -a "$COMPOSE" "$COMPOSE.bak-$(date +%Y%m%d%H%M%S)"
  docker tag "$IMAGE" fmcc:current
  sed -i "s|image: $IMAGE|image: fmcc:current|" "$COMPOSE"
fi

touch /opt/fm/deploy.log && chown fmadmin:fmadmin /opt/fm/deploy.log
echo "instalado. Teste: ssh -i <chave-de-deploy> deploy@<host> 'deploy command <sha40>'"
