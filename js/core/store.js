/** 사용자 설정 및 세션 상태. localStorage에 보관하고 변경 시 이벤트를 쏜다. */

const KEY = 'gdh:settings';

const DEFAULTS = {
  adapter: 'local',
  namespace: 'gdh',
  gasEndpoint: '',
  gasToken: '',
  authSession: '',
  authUser: null,
  githubRepo: '',
  githubToken: '',
  actorId: '',
  projectId: '',
  seeded: false,
  syncSeconds: 60,   // 자동 동기화 주기(초). 0이면 사용 안 함
};

function read() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export const settings = read();

export const store = new EventTarget();

export function saveSettings(patch = {}) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); }
  catch (e) { console.warn('[store] 설정 저장 실패', e); }
  store.dispatchEvent(new CustomEvent('settings', { detail: patch }));
  return settings;
}

export function resetSettings() {
  Object.assign(settings, DEFAULTS);
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  store.dispatchEvent(new CustomEvent('settings', { detail: DEFAULTS }));
}
