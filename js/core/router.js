import { $$ } from './dom.js';

/**
 * 해시 기반 라우터. GitHub Pages(정적 호스팅)에서 404 없이 동작한다.
 * 패턴: '/tasks/:id'
 */
export class Router {
  constructor(routes, { onNavigate } = {}) {
    this.routes = Object.entries(routes).map(([pattern, handler]) => {
      const keys = [];
      const regex = toRegex(pattern, (k) => keys.push(k));
      return { pattern, handler, keys, regex };
    });
    this.onNavigate = onNavigate;
    this.current = null;
    window.addEventListener('hashchange', () => this.resolve());
  }

  start() { this.resolve(); }

  static go(path) { window.location.hash = path.startsWith('#') ? path : `#${path}`; }

  get path() {
    const raw = window.location.hash.replace(/^#/, '') || '/dashboard';
    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  resolve() {
    const [pathname, queryString = ''] = this.path.split('?');
    for (const route of this.routes) {
      const m = pathname.match(route.regex);
      if (!m) continue;
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const query = Object.fromEntries(new URLSearchParams(queryString));
      this.current = { ...route, params, query, pathname };
      markActive(pathname);
      this.onNavigate?.(this.current);
      route.handler({ params, query, path: pathname });
      return;
    }
    Router.go('/dashboard');
  }
}

function toRegex(pattern, collect) {
  const source = pattern.replace(/:([\w]+)/g, (_, key) => { collect(key); return '([^/]+)'; });
  return new RegExp(`^${source}/?$`);
}

function markActive(pathname) {
  const top = `/${pathname.split('/')[1] || ''}`;
  for (const a of $$('#nav a')) {
    const href = a.getAttribute('href').replace(/^#/, '');
    a.classList.toggle('active', href === top || href.startsWith(`${top}/`));
  }
}
