# Huly Tools (OpenClaw-Upgrade)

Small helper scripts to interact with Huly (canonical project tracker).

## Setup

```bash
cd tools/huly
cp .env.example .env
# edit .env (DO NOT COMMIT)

npm install
```

## Scripts

### List projects

```bash
npm run list-projects
```

### Create an issue

```bash
npm run create-issue -- --title "Test" --body "Hello" --priority urgent
```

## Notes
- Auth: prefer `HULY_TOKEN` (API key). Email/password works too.
- You must set `HULY_WORKSPACE` (slug from `/workbench/<workspace>` URL).
