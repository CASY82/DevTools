/** 순수 함수 유틸 모음. 도메인/뷰 어디서든 재사용된다. */

export const nowIso = () => new Date().toISOString();

/** 정렬 가능한 짧은 고유 ID (시간 프리픽스 + 랜덤). */
export function uid(prefix = '') {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${prefix ? '-' : ''}${t}${r}`;
}

export function fmtDate(iso, withTime = true) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
}

const REL = [
  [60, 1, '초'], [3600, 60, '분'], [86400, 3600, '시간'],
  [604800, 86400, '일'], [2592000, 604800, '주'], [Infinity, 2592000, '개월'],
];
export function relTime(iso) {
  if (!iso) return '-';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 30) return '방금';
  for (const [limit, div, unit] of REL) {
    if (s < limit) return `${Math.floor(s / div)}${unit} 전`;
  }
  return fmtDate(iso, false);
}

export const byDesc = (key) => (a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0);
export const byAsc = (key) => (a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0);

export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const k = keyFn(item);
    const arr = map.get(k);
    if (arr) arr.push(item); else map.set(k, [item]);
  }
  return map;
}

export const indexBy = (list, key = 'id') => new Map(list.map((r) => [r[key], r]));

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** 문자열/파일의 SHA-256 hex. Web Crypto가 없으면 경량 폴백을 쓴다. */
export async function sha256(input) {
  const buf = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 16777619) >>> 0;
    h2 = Math.imul(h2 + bytes[i] + i, 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(4).slice(0, 64);
}

export const initials = (name) => String(name || '?').trim().slice(0, 2).toUpperCase();

/** 부분 문자열 검색용 정규화. */
export const norm = (s) => String(s ?? '').toLowerCase();

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept = '*/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

/** 여러 파일 선택. 드롭과 같은 경로로 처리하기 위해 항상 배열을 돌려준다. */
export function pickFiles(accept = '*/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.onchange = () => resolve([...(input.files || [])]);
    input.click();
  });
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
