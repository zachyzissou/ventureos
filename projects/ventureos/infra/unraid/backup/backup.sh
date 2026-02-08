#!/usr/bin/env bash
set -euo pipefail

DATE=$(date +%F)
BACKUP_DIR=/mnt/user/backups/ventureos/$DATE
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR/postgres" "$BACKUP_DIR/minio" "$BACKUP_DIR/qdrant" "$BACKUP_DIR/meili"

# Postgres dumps
PG_VENTUREOS_PWD=$(grep POSTGRES_VENTUREOS_PASSWORD .env | cut -d= -f2-)
PG_TEMPORAL_PWD=$(grep POSTGRES_TEMPORAL_PASSWORD .env | cut -d= -f2-)
PG_KEYCLOAK_PWD=$(grep POSTGRES_KEYCLOAK_PASSWORD .env | cut -d= -f2-)

PGPASSWORD=$PG_VENTUREOS_PWD pg_dump -h 127.0.0.1 -p 15432 -U ventureos ventureos > "$BACKUP_DIR/postgres/ventureos.sql"
PGPASSWORD=$PG_TEMPORAL_PWD pg_dump -h 127.0.0.1 -p 15433 -U temporal temporal > "$BACKUP_DIR/postgres/temporal.sql"
PGPASSWORD=$PG_KEYCLOAK_PWD pg_dump -h 127.0.0.1 -p 15434 -U keycloak keycloak > "$BACKUP_DIR/postgres/keycloak.sql"

# File‑based backups
rsync -a /mnt/user/storage/ventureos/minio/ "$BACKUP_DIR/minio/"
rsync -a /mnt/user/storage/ventureos/qdrant/ "$BACKUP_DIR/qdrant/"
rsync -a /mnt/user/storage/ventureos/meili/ "$BACKUP_DIR/meili/"

# Retention
find /mnt/user/backups/ventureos -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \;

echo "Backup complete: $BACKUP_DIR"
