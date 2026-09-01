import { AdapterError } from './base.js';

const API = 'https://api.github.com';

/**
 * GitHub 읽기 전용 연동 클라이언트.
 *
 * 정적 호스팅(GitHub Pages)에서는 Webhook 수신 서버를 둘 수 없으므로,
 * 계획서 9장의 "Webhook → Task 매핑"을 REST 폴링 + 커밋/브랜치 키 파싱으로 대체한다.
 * 서버가 생기면 동일한 정규화 결과({type, sha, message, ...})를 그대로 재사용할 수 있다.
 */
export class GitHubClient {
  constructor({ repo = '', token = '' } = {}) {
    this.repo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
    this.token = token.trim();
  }

  get configured() { return /^[\w.-]+\/[\w.-]+$/.test(this.repo); }

  async #get(path, params = {}) {
    if (!this.configured) throw new AdapterError('GitHub 저장소를 "owner/repo" 형식으로 설정하세요.');
    const url = new URL(`${API}/repos/${this.repo}${path}`);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    const headers = { Accept: 'application/vnd.github+json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let res;
    try { res = await fetch(url, { headers }); }
    catch (e) { throw new AdapterError('GitHub API 연결에 실패했습니다.', e); }

    if (res.status === 404) throw new AdapterError(`저장소를 찾을 수 없습니다: ${this.repo} (비공개라면 토큰이 필요합니다)`);
    if (res.status === 401 || res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      throw new AdapterError(remaining === '0'
        ? 'GitHub API 호출 한도를 초과했습니다. 설정에서 토큰을 등록하면 한도가 늘어납니다.'
        : 'GitHub 인증에 실패했습니다. 토큰 권한을 확인하세요.');
    }
    if (!res.ok) throw new AdapterError(`GitHub API 오류 (${res.status})`);
    return res.json();
  }

  async listBranches(perPage = 100) {
    const rows = await this.#get('/branches', { per_page: perPage });
    return rows.map((b) => ({ name: b.name, sha: b.commit?.sha }));
  }

  async listCommits({ branch, perPage = 50 } = {}) {
    const rows = await this.#get('/commits', { sha: branch, per_page: perPage });
    return rows.map((c) => ({
      type: 'commit',
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: (c.commit?.message || '').split('\n')[0],
      author: c.author?.login || c.commit?.author?.name || 'unknown',
      date: c.commit?.author?.date,
      url: c.html_url,
      branch: branch || null,
    }));
  }

  async listPulls({ state = 'all', perPage = 50 } = {}) {
    const rows = await this.#get('/pulls', { state, per_page: perPage, sort: 'updated', direction: 'desc' });
    return rows.map((p) => ({
      type: 'pull_request',
      number: p.number,
      title: p.title,
      state: p.merged_at ? 'merged' : p.state,
      author: p.user?.login || 'unknown',
      branch: p.head?.ref,
      date: p.updated_at,
      url: p.html_url,
    }));
  }
}

/**
 * 커밋 메시지/브랜치명에서 Task 키(GAME-142)를 추출한다.
 * @param {string} text
 * @param {string[]} keys 프로젝트 키 목록 (예: ['GAME','TOOL'])
 */
export function extractTaskKeys(text, keys) {
  if (!text || !keys?.length) return [];
  const pattern = new RegExp(`\\b(${keys.map((k) => k.replace(/[^\w]/g, '')).join('|')})-(\\d+)\\b`, 'gi');
  const found = new Set();
  for (const m of String(text).matchAll(pattern)) found.add(`${m[1].toUpperCase()}-${m[2]}`);
  return [...found];
}
