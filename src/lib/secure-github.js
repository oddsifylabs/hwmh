/**
 * SecureGitHubClient
 * Oddsify Labs — Security-first GitHub API wrapper for Hermes Agents.
 *
 * Rules:
 *   1. Token is read ONLY from process.env.GITHUB_TOKEN.
 *   2. Token is NEVER logged, printed, or included in error messages.
 *   3. All errors are sanitized before thrown.
 *   4. Requests time out after 15s.
 *   5. Only HTTPS to api.github.com.
 */

const axios = require('axios');

const TOKEN_PLACEHOLDER = '[REDACTED]';
const GITHUB_API_BASE = 'https://api.github.com';

function sanitizeError(err, token) {
  if (!err) return err;
  const tokenPattern = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

  if (err.message) {
    err.message = err.message.replace(tokenPattern, TOKEN_PLACEHOLDER);
  }
  if (err.stack) {
    err.stack = err.stack.replace(tokenPattern, TOKEN_PLACEHOLDER);
  }
  if (err.config && err.config.headers) {
    if (err.config.headers.Authorization) {
      err.config.headers.Authorization = 'token ' + TOKEN_PLACEHOLDER;
    }
  }
  if (err.response && err.response.config && err.response.config.headers) {
    if (err.response.config.headers.Authorization) {
      err.response.config.headers.Authorization = 'token ' + TOKEN_PLACEHOLDER;
    }
  }
  return err;
}

class SecureGitHubClient {
  constructor() {
    this.token = process.env.GITHUB_TOKEN;
    if (!this.token || !this.token.startsWith('ghp_')) {
      throw new Error(
        'GITHUB_TOKEN is missing or malformed. ' +
        'Set a valid GitHub personal access token (classic or fine-grained) in the environment.'
      );
    }

    this.client = axios.create({
      baseURL: GITHUB_API_BASE,
      timeout: 15000,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `token ${this.token}`,
        'User-Agent': 'OddsifyLabs-HermesBot/1.0',
      },
    });

    // Response interceptor: sanitize any error before it reaches caller
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        throw sanitizeError(error, this.token);
      }
    );
  }

  /**
   * Validate the token by hitting /user.
   */
  async validateToken() {
    try {
      const { data } = await this.client.get('/user');
      return { valid: true, login: data.login };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * GET /repos/:owner/:repo
   */
  async getRepo(owner, repo) {
    const { data } = await this.client.get(`/repos/${owner}/${repo}`);
    return data;
  }

  /**
   * GET /repos/:owner/:repo/contents/:path
   */
  async getFile(owner, repo, path, ref = 'main') {
    const { data } = await this.client.get(
      `/repos/${owner}/${repo}/contents/${path}?ref=${ref}`
    );
    return data;
  }

  /**
   * PUT /repos/:owner/:repo/contents/:path
   */
  async createOrUpdateFile(owner, repo, path, content, message, branch = 'main') {
    let sha;
    try {
      const existing = await this.getFile(owner, repo, path, branch);
      sha = existing.sha;
    } catch (err) {
      if (!err.response || err.response.status !== 404) throw err;
      // 404 is fine — file doesn't exist yet
    }

    const payload = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
    };
    if (sha) payload.sha = sha;

    const { data } = await this.client.put(
      `/repos/${owner}/${repo}/contents/${path}`,
      payload
    );
    return data;
  }

  /**
   * POST /repos/:owner/:repo/git/refs
   */
  async createBranch(owner, repo, newBranch, fromBranch = 'main') {
    const { data: refData } = await this.client.get(
      `/repos/${owner}/${repo}/git/refs/heads/${fromBranch}`
    );
    const { data } = await this.client.post(`/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${newBranch}`,
      sha: refData.object.sha,
    });
    return data;
  }

  /**
   * POST /repos/:owner/:repo/pulls
   */
  async createPullRequest(owner, repo, title, head, base = 'main', body = '') {
    const { data } = await this.client.post(`/repos/${owner}/${repo}/pulls`, {
      title,
      head,
      base,
      body,
    });
    return data;
  }

  /**
   * GET /repos/:owner/:repo/issues
   */
  async listIssues(owner, repo, state = 'open') {
    const { data } = await this.client.get(
      `/repos/${owner}/${repo}/issues?state=${state}`
    );
    return data;
  }

  /**
   * POST /repos/:owner/:repo/issues
   */
  async createIssue(owner, repo, title, body = '', labels = []) {
    const { data } = await this.client.post(`/repos/${owner}/${repo}/issues`, {
      title,
      body,
      labels,
    });
    return data;
  }

  /**
   * GET /repos/:owner/:repo/pulls
   */
  async listPullRequests(owner, repo, state = 'open') {
    const { data } = await this.client.get(
      `/repos/${owner}/${repo}/pulls?state=${state}`
    );
    return data;
  }

  /**
   * POST /repos/:owner/:repo/commits/:sha/comments
   */
  async commitComment(owner, repo, sha, body, path = undefined, position = undefined) {
    const payload = { body };
    if (path !== undefined) payload.path = path;
    if (position !== undefined) payload.position = position;
    const { data } = await this.client.post(
      `/repos/${owner}/${repo}/commits/${sha}/comments`,
      payload
    );
    return data;
  }

  /**
   * Helper: decode base64 content from getFile response.
   */
  static decodeContent(fileResponse) {
    if (fileResponse && fileResponse.content) {
      return Buffer.from(fileResponse.content, 'base64').toString('utf-8');
    }
    return null;
  }
}

module.exports = { SecureGitHubClient, sanitizeError };
