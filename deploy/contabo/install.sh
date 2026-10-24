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
if ! grep -q 'image: fmcc:current' "$COMPOSE"; then
  cur="$(grep -oE 'image: fmcc:[A-Za-z0-9._-]+' "$COMPOSE" | head -1 | cut -d: -f3)"
  [[ -n "$cur" ]] || { echo "nao achei 'image: fmcc:<tag>' no compose" >&2; exit 1; }
  cp -a "$COMPOSE" "$COMPOSE.bak-$(date +%Y%m%d%H%M%S)"
  docker tag "fmcc:$cur" fmcc:current
  sed -i "s|image: fmcc:$cur|image: fmcc:current|" "$COMPOSE"
fi

touch /opt/fm/deploy.log && chown fmadmin:fmadmin /opt/fm/deploy.log
echo "instalado. Teste: ssh -i <chave-de-deploy> deploy@<host> 'deploy command <sha40>'"
