#!/usr/bin/env bash
# Local'den çalıştır — git push + ssh ile server'da git pull + docker compose build + up + migrate.
#
# Kullanım:
#   ./infra/scripts/deploy.sh

set -euo pipefail

SERVER_USER=deploy
SERVER_HOST="${BUTIKA_SERVER_HOST:?Sunucu adresini BUTIKA_SERVER_HOST ile verin}"
REMOTE_DIR=/opt/butika

# SSH anahtarı: env override → varsayılan yol. Anahtar repoda TUTULMAZ.
SSH_KEY="${BUTIKA_SSH_KEY:-$HOME/.ssh/butika_deploy}"

cyan()  { printf "\033[1;36m%s\033[0m\n" "$*"; }
red()   { printf "\033[1;31m%s\033[0m\n" "$*"; }
green() { printf "\033[1;32m%s\033[0m\n" "$*"; }

[ -f "$SSH_KEY" ] || { red "SSH anahtarı bulunamadı: BUTIKA_SSH_KEY=/yol/anahtar ile ver."; exit 1; }

# ─── 1. Local sağlık kontrolü ──────────────────────────────────────────────
cyan "→ Local repo durumu kontrol ediliyor"
if ! git diff --quiet || ! git diff --cached --quiet; then
  red "Uncommitted değişiklikler var. Önce commit yap."
  git status --short
  exit 1
fi

git fetch origin --quiet
LOCAL=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")

if [ -z "$REMOTE" ]; then
  red "Remote branch yok. git push -u origin $BRANCH yap."
  exit 1
fi

if [ "$LOCAL" != "$REMOTE" ]; then
  red "Local ($BRANCH) commit'i remote'tan farklı. git push yap."
  exit 1
fi

green "✓ Local clean, remote ile sync"

# ─── 2. Server'a SSH ile deploy ────────────────────────────────────────────
# Sıra: build → env ön kontrolü → DB yedeği → migration (yeni image ile, API'den
# ÖNCE; hata deploy'u durdurur) → up. Migration'lar yalnız ekleme yapar; eski
# API yeni şemayla çalışmaya devam eder, bu yüzden canlı API bozulmaz.
# Yedek alınamazsa deploy durur; yedeği elle alıp bilinçli geçmek: SKIP_BACKUP=1.
cyan "→ Server'a deploy ediliyor ($SERVER_HOST)"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SERVER_USER@$SERVER_HOST" \
  REMOTE_DIR="$REMOTE_DIR" BRANCH="$BRANCH" SKIP_BACKUP="${SKIP_BACKUP:-0}" bash -se <<'REMOTE_EOF'
set -euo pipefail
cd "$REMOTE_DIR"
COMPOSE=(docker compose -f infra/docker-compose.prod.yml --env-file .env.production)

echo "→ git pull --ff-only"
git pull --ff-only origin "$BRANCH"

echo "→ docker compose build (api + admin)"
"${COMPOSE[@]}" build api admin

echo "→ env ön kontrolü (yeni image, servis başlatmadan; sır yazdırmaz)"
# -T + </dev/null: bu betik ssh'a stdin'den besleniyor. "compose run" stdin'i
# konteynere bağlar ve betiğin kalan satırlarını (migration, up -d) yutar;
# deploy hatasız görünüp yarıda kalır. Girişi kapatmak şart.
"${COMPOSE[@]}" run --rm -T --no-deps api bun run apps/api/src/check-env.ts </dev/null

if [ "$SKIP_BACKUP" != "1" ]; then
  echo "→ veritabanı yedeği (infra/scripts/backup.sh)"
  sudo -n bash infra/scripts/backup.sh || {
    echo "✗ Yedek alınamadı; migration YAPILMADI. Yedeği elle alıp SKIP_BACKUP=1 ile tekrar çalıştır."
    exit 1
  }
fi

echo "→ migrate (yeni image ile, API'den önce; hata deploy'u durdurur)"
# api container'ında pnpm yok; migrate.ts doğrudan çalıştırılır.
"${COMPOSE[@]}" run --rm -T --no-deps api bun run packages/db/src/migrate.ts </dev/null

echo "→ docker compose up -d"
"${COMPOSE[@]}" up -d

echo "→ ps"
"${COMPOSE[@]}" ps
REMOTE_EOF

# ─── 3. Public health check ────────────────────────────────────────────────
cyan "→ Public health check"
sleep 3
if HEALTH=$(curl -sf https://api.butika.ai/health); then
  green "✓ api.butika.ai $HEALTH"
else
  red "✗ api.butika.ai erişilemiyor (tarayıcıdan kontrol et)"
fi
if curl -sIf https://admin.butika.ai/login >/dev/null 2>&1; then
  green "✓ admin.butika.ai"
else
  red "✗ admin.butika.ai erişilemiyor"
fi

echo ""
green "Deploy tamam ($LOCAL)"
