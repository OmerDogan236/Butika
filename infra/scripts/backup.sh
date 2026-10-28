#!/usr/bin/env bash
# Postgres pg_dump → gzip → /var/backups/butika/YYYY-MM-DD.sql.gz
# Daily cron çalıştırılır (v1 manuel, v2 systemd timer).
#
# Server'da deploy user veya root olarak:
#   sudo bash /opt/butika/infra/scripts/backup.sh

set -euo pipefail

BACKUP_DIR=/var/backups/butika
TIMESTAMP=$(date +%F-%H%M)
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

echo "==> pg_dump butika"
sudo -u postgres pg_dump butika | gzip > "$BACKUP_DIR/butika-$TIMESTAMP.sql.gz"

echo "==> $BACKUP_DIR/butika-$TIMESTAMP.sql.gz ($(du -h "$BACKUP_DIR/butika-$TIMESTAMP.sql.gz" | cut -f1))"

echo "==> Eski yedekleri temizle (>${KEEP_DAYS} gün)"
find "$BACKUP_DIR" -name "butika-*.sql.gz" -mtime "+$KEEP_DAYS" -delete

ls -lh "$BACKUP_DIR" | tail -10
