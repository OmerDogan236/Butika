#!/usr/bin/env bash
# Hetzner Debian 13 (trixie) — tek-seferlik server hazırlık scripti.
# Local'den çalıştırılır:
#   ssh -i ~/.ssh/butika_deploy root@<SUNUCU_IP> 'bash -s' < infra/scripts/bootstrap-server.sh
#
# Idempotent: tekrar çalıştırılabilir, var olan adımları skip eder.

set -euo pipefail

log() { echo -e "\n\033[1;34m==> $*\033[0m"; }

# ─── 1. apt update + temel paketler ─────────────────────────────────────────
log "apt update + temel paketler"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y \
  curl git ufw fail2ban ca-certificates gnupg lsb-release sudo \
  unattended-upgrades apt-transport-https

# ─── 2. UFW ─────────────────────────────────────────────────────────────────
log "UFW kuralları"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ─── 3. fail2ban ───────────────────────────────────────────────────────────
log "fail2ban enable"
systemctl enable --now fail2ban

# ─── 4. Docker (resmi script) ──────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Docker (resmi get.docker.com script)"
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm /tmp/get-docker.sh
else
  log "Docker zaten kurulu — skip"
fi
systemctl enable --now docker

# ─── 5. PostgreSQL 18 (resmi apt repo) ─────────────────────────────────────
if ! command -v psql >/dev/null 2>&1; then
  log "PostgreSQL 18 (apt.postgresql.org)"
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update
  apt-get install -y postgresql-18
else
  log "PostgreSQL zaten kurulu — skip"
fi
systemctl enable --now postgresql

# ─── 6. Nginx (resmi nginx.org repo) ────────────────────────────────────────
# Distro nginx KURULMAYACAK; eğer yanlışlıkla varsa kaldırıyoruz.
if dpkg -l | grep -q '^ii  nginx ' && ! [ -f /etc/apt/sources.list.d/nginx.list ]; then
  log "Distro nginx tespit edildi — kaldırılıyor"
  apt-get remove -y nginx nginx-common nginx-core || true
fi

if ! command -v nginx >/dev/null 2>&1; then
  log "Nginx (nginx.org stable)"
  curl -fsSL https://nginx.org/keys/nginx_signing.key \
    | gpg --dearmor -o /usr/share/keyrings/nginx-archive-keyring.gpg
  # Debian 13 (trixie) için nginx.org henüz paket vermiyor; bookworm fallback.
  CODENAME=$(lsb_release -cs)
  case "$CODENAME" in
    trixie|forky) NGINX_CODENAME=bookworm ;;
    *)            NGINX_CODENAME="$CODENAME" ;;
  esac
  echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] http://nginx.org/packages/debian $NGINX_CODENAME nginx" \
    > /etc/apt/sources.list.d/nginx.list
  apt-get update
  apt-get install -y nginx
else
  log "Nginx zaten kurulu — skip"
fi
systemctl enable --now nginx

# ─── 7. deploy user ─────────────────────────────────────────────────────────
if ! id deploy >/dev/null 2>&1; then
  log "deploy user yarat"
  adduser --disabled-password --gecos "" deploy
  usermod -aG docker deploy
  mkdir -p /home/deploy/.ssh
  cp /root/.ssh/authorized_keys /home/deploy/.ssh/
  chown -R deploy:deploy /home/deploy/.ssh
  chmod 700 /home/deploy/.ssh
  chmod 600 /home/deploy/.ssh/authorized_keys
else
  log "deploy user zaten var — sadece docker group + ssh sync"
  usermod -aG docker deploy
fi

# ─── 8. SSH hardening ───────────────────────────────────────────────────────
log "SSH hardening"
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd || true

# ─── 9. /opt/butika klasörü ─────────────────────────────────────────────────
log "/opt/butika hazırlık"
mkdir -p /opt/butika
chown deploy:deploy /opt/butika

# ─── 10. GitHub deploy key (deploy user altında) ────────────────────────────
if [ ! -f /home/deploy/.ssh/github_deploy ]; then
  log "GitHub deploy key gen (deploy user)"
  su - deploy -c "ssh-keygen -t ed25519 -N '' -f ~/.ssh/github_deploy -C 'butika-server-deploy'"
  su - deploy -c 'cat > ~/.ssh/config <<EOF
Host github.com
  IdentityFile ~/.ssh/github_deploy
  StrictHostKeyChecking accept-new
EOF
chmod 600 ~/.ssh/config'
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Bootstrap tamamlandı."
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Bir sonraki adımlar (manuel):"
echo ""
echo "1. GitHub deploy key (read-only) ekle:"
echo "   cat /home/deploy/.ssh/github_deploy.pub  →  github.com/<kullanici>/butika/settings/keys"
echo ""
echo "2. Postgres init (setup-db.sh çalıştır)"
echo ""
echo "3. Cloudflare cert dosyalarını scp et"
echo ""
echo "4. Nginx config'i scp et + reload"
echo ""
echo "5. Repo clone + .env.production + ilk build"
echo ""
