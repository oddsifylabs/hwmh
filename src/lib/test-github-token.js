/**
 * Secure token validation script.
 * Usage: node test-github-token.js
 * Result: validates GITHUB_TOKEN without ever printing it.
 */

require('dotenv').config();
const { SecureGitHubClient } = require('./secure-github');

(async () => {
  try {
    const gh = new SecureGitHubClient();
    const result = await gh.validateToken();
    if (result.valid) {
      console.log(`✅ Token is valid. Authenticated as: ${result.login}`);
      process.exit(0);
    } else {
      console.error(`❌ Token invalid: ${result.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
})();
