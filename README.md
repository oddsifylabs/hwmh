# HWMH - Hermes Workers Management Hub

> You got them Hermes Workers, we got a Boss for them.

MIT Licensed | Open Source | Self-Hosted

---

## Architecture

```
Director (You)
    ↓
Sophia Hermes — Manager Persona
    ↓
Gottfried — AI Reasoning Engine (Leibniz Logic Engine)
    ↓
Workers
    ├── Iris Hermes — Admin Assistant
    ├── Pheme Hermes — Social Media Manager
    └── Kairos Hermes — Sales & Marketing
```

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/oddsify-labs/hwmh.git
cd hwmh

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env → set API_KEY, GITHUB_TOKEN

# 4. Start hub
npm start

# 5. Start workers (in separate terminals)
npm run worker:iris
npm run worker:pheme
npm run worker:kairos
```

---

## Commands

| Command | What It Does |
|---------|-------------|
| `@sophia status` | Get system status report |
| `@iris schedule meeting tomorrow 3pm` | Delegate to Iris |
| `@pheme draft tweet about AI` | Delegate to Pheme |
| `@kairos find leads in Arizona` | Delegate to Kairos |

---

## API

```bash
curl -X POST http://localhost:3000/command \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_key" \
  -d '{"command": "@pheme post-x Hello world"}'
```

---

## Workers

| Worker | Role | Capabilities |
|--------|------|-------------|
| **Iris** | Admin Assistant | `admin`, `schedule`, `research`, `documentation`, `email`, `reminder` |
| **Pheme** | Social Media | `post-x`, `engagement`, `analytics`, `schedule`, `content-strategy`, `curate-content` |
| **Kairos** | Sales & Marketing | `lead-generation`, `sales`, `marketing`, `crm`, `analytics`, `content-strategy` |

---

## Paid Tiers (Future)

| Tier | Unlocks |
|------|---------|
| **Free** | Sophia + Iris + Pheme + Kairos |
| **Team** | Additional workers, web dashboard, API keys |
| **Business** | Advanced orchestration, RBAC, audit logs |
| **Enterprise** | Custom agents, white-label, dedicated infra |

---

## Security

- `.env` files are `.gitignore`d and `chmod 600`
- `GITHUB_TOKEN` is redacted from all logs
- API key auth on all endpoints
- Token validation (must start with `ghp_`)

See `src/lib/GITHUB_SECURITY_README.md` for details.

---

Built by **Oddsify Labs** — A Collins & Collins Technologies Company
