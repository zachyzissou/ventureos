# VentureOS Unraid Deployment (Tailscale‑only)

## 1) Files
- docker-compose.yml
- .env (NOT committed; copy from .env.example and rotate as needed)
- .env.example (committed template)
- prometheus/prometheus.yml
- loki/loki-config.yaml
- backup/backup.sh

## 2) Base Paths (approved)
- /mnt/user/appdata/ventureos/   (configs)
- /mnt/user/storage/ventureos/   (data)
- /mnt/user/backups/ventureos/   (backups)

## 3) Bring up services
Copy this folder to Unraid (e.g., /mnt/user/appdata/ventureos/compose)

```bash
docker compose --env-file .env up -d
```

## 4) Access (Tailscale)
- Temporal UI: http://slurpnet.local:8233
- MinIO: http://slurpnet.local:9000
- MinIO Console: http://slurpnet.local:9001
- Qdrant: http://slurpnet.local:6333
- Meilisearch: http://slurpnet.local:7700
- Keycloak: http://slurpnet.local:8081
- Prometheus: http://slurpnet.local:9090
- Grafana: http://slurpnet.local:3300
- Loki: http://slurpnet.local:3100

## 5) Redis
Redis is external:
- redis-stack running at slurpnet.local:6379

## 6) Backups (daily)
Use Unraid “User Scripts” plugin to run:
```
/mnt/user/appdata/ventureos/compose/backup/backup.sh
```
Set to daily schedule. Adjust retention in script (RETENTION_DAYS).
