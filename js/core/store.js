/** 사용자 설정 및 세션 상태. localStorage에 보관하고 변경 시 이벤트를 쏜다. */
import { DEFAULT_GAS_ENDPOINT } from '../config.js';

const KEY = 'gdh:settings';

const DEFAULTS = {
  adapter: 'local',
  namespace: 'gdh',
  gasEndpoint: DEFAULT_GAS_ENDPOINT,
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
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
  const merged = { ...DEFAULTS, ...saved };
  // 빈 값으로 저장된 예전 설정이 배포 기본값을 덮어쓰지 않게 한다.
  if (!merged.gasEndpoint) merged.gasEndpoint = DEFAULT_GAS_ENDPOINT;
  return merged;
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
