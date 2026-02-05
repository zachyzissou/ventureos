# Plane Self-Hosting Checklist

## Pre-Installation Preparation
1. Create dedicated directory for Plane
   ```bash
   mkdir -p ~/plane-selfhost
   cd ~/plane-selfhost
   ```

2. Download and run official setup script
   ```bash
   curl -fsSL -o setup.sh https://github.com/makeplane/plane/releases/latest/download/setup.sh
   chmod +x setup.sh
   ./setup.sh  # Choose appropriate installation option
   ```

## Configuration Critical Points
### plane.env (Main Environment)
```bash
# Network & Port Configuration
LISTEN_HTTP_PORT=7210
LISTEN_HTTPS_PORT=7211
WEB_URL=http://192.168.225.149:7210
CORS_ALLOWED_ORIGINS=http://192.168.225.149:7210
```

### plane-app/plane.env
```bash
# Application Domain and Listening Ports
APP_DOMAIN=192.168.225.149:7210
LISTEN_HTTP_PORT=7210
LISTEN_HTTPS_PORT=7211
SITE_ADDRESS=:7210
```

## Docker Compose Configuration
### Use ONLY docker-compose.yaml (NOT docker-compose.yml)
In docker-compose.yaml, ensure proxy ports match env:
```yaml
proxy:
  ports:
    - target: ${LISTEN_HTTP_PORT:-80}
      published: ${LISTEN_HTTP_PORT:-80}
    - target: ${LISTEN_HTTPS_PORT:-443}
      published: ${LISTEN_HTTPS_PORT:-443}
```

## Startup Command
```bash
cd ~/plane-selfhost/plane-app
docker compose -f docker-compose.yaml --env-file ../plane.env up -d
```

## Troubleshooting Checklist
- ✅ Used official setup.sh
- ✅ Verified docker-compose.yaml (NOT .yml)
- ✅ Consistent port configuration across env files
- ✅ Proxy container ports match published ports
- ✅ Used explicit env file in docker compose command

## Common Failure Points
- Incorrect compose file selection
- Mismatched port configurations
- Inconsistent environment variable settings