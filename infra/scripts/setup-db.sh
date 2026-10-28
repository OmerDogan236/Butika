#!/usr/bin/env bash
# Postgres 18 user/db + pg_hba.conf docker bridge erişimi.
# Server'da root olarak çalıştır:
#   sudo bash /opt/butika/infra/scripts/setup-db.sh
#
# Çıktıda DATABASE_URL satırı verir — bunu .env.production'a yapıştır.

set -euo pipefail

PG_VERSION=18
PG_CONF=/etc/postgresql/$PG_VERSION/main/postgresql.conf
PG_HBA=/etc/postgresql/$PG_VERSION/main/pg_hba.conf

if [ "$EUID" -ne 0 ]; then
  echo "Bu script root olarak çalıştırılmalı (sudo)."
  exit 1
fi

# Random pw
PG_PASSWORD=$(openssl rand -hex 16)

echo "==> Butika DB + user yarat"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'butika') THEN
    CREATE USER butika WITH PASSWORD '$PG_PASSWORD';
  ELSE
    ALTER USER butika WITH PASSWORD '$PG_PASSWORD';
  END IF;
END
\$\$;

SELECT 'DB butika zaten var, atlanıyor' WHERE EXISTS (SELECT FROM pg_database WHERE datname = 'butika');
SQL

# Database yarat (idempotent — daha karmaşık DO bloğu yerine basit check):
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='butika'" | grep -q 1; then
  sudo -u postgres createdb -O butika butika
  echo "==> butika DB yaratıldı"
fi

echo "==> postgresql.conf listen_addresses güncelle"
# 172.17.0.1 = docker0 default bridge gateway
if ! grep -qE "^listen_addresses\s*=\s*'localhost,172.17.0.1'" "$PG_CONF"; then
  sed -i "s|^#*listen_addresses\s*=.*|listen_addresses = 'localhost,172.17.0.1'|" "$PG_CONF"
fi

echo "==> pg_hba.conf docker bridge kuralı ekle"
HBA_RULE="host  butika  butika  172.17.0.0/16  scram-sha-256"
if ! grep -qF "172.17.0.0/16" "$PG_HBA"; then
  echo "$HBA_RULE" >> "$PG_HBA"
fi

systemctl restart postgresql

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Postgres ready."
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "DATABASE_URL=postgres://butika:$PG_PASSWORD@host.docker.internal:5432/butika"
echo ""
echo "Bu satırı /opt/butika/.env.production içine kopyala."
echo ""
