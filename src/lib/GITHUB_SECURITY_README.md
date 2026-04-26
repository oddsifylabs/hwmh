# Secure GitHub Integration — Hermes Agents

## Quick Start

```javascript
require('dotenv').config();
const { SecureGitHubClient } = require('./github');

const gh = new SecureGitHubClient();

// Validate token (safe — never logs the token)
const { valid, login } = await gh.validateToken();

// Push a file
await gh.createOrUpdateFile(
  'oddsifylabs',
  'nightlydebrief',
  '2026-04-26/debrief.md',
  '# Debrief\n...',
  'Add nightly debrief',
  'main'
);

// Create a branch + PR
await gh.createBranch('oddsifylabs', 'my-repo', 'feature-x', 'main');
await gh.createPullRequest('oddsifylabs', 'my-repo', 'Add feature X', 'feature-x');
```

## Security Guarantees

1. **Token is env-only** — loaded from `GITHUB_TOKEN`. Never hardcoded.
2. **Token is never logged** — redacted from all errors and stack traces.
3. **Token is validated** — must start with `ghp_`.
4. **HTTPS only** — all requests to `api.github.com`.
5. **Timeout** — 15-second request timeout prevents hanging.

## Token Best Practices

- **Rotate regularly** — delete and regenerate in GitHub Settings.
- **Use fine-grained PATs** when possible (scoped to specific repos).
- **One token per bot** is ideal — set `GITHUB_TOKEN` uniquely per worker `.env`.
- **Never commit `.env`** — `.gitignore` is enforced.

## Files Deployed

| Bot | Secure Client | Test Script | `.gitignore` |
|-----|--------------|-------------|--------------|
| HAMH Server | `src/lib/secure-github.js` | `src/lib/test-github-token.js` | ✅ |
| Markus | `github.js` | `test-github-token.js` | ✅ |
| Miah | `github.js` | `test-github-token.js` | ✅ |
| Mitch | `github.js` | `test-github-token.js` | ✅ |
| Ruth | `github.js` | `test-github-token.js` | ✅ |
| Nova | `github.js` | `test-github-token.js` | ✅ |
