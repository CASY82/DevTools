import { settings, saveSettings } from './store.js';

export class AuthError extends Error {}

export async function authCall(action, payload = {}, { session = true } = {}) {
  const endpoint = String(settings.gasEndpoint || '').trim();
  if (!endpoint) throw new AuthError('Apps Script 웹앱 URL을 입력하세요.');
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
      body: JSON.stringify({ action, ...(session ? { session: settings.authSession } : {}), ...payload }),
    });
  } catch (cause) { throw new AuthError('인증 서버에 연결하지 못했습니다.', { cause }); }
  let data;
  try { data = JSON.parse(await response.text()); }
  catch { throw new AuthError('인증 서버가 올바른 응답을 반환하지 않았습니다.'); }
  if (data.error) throw new AuthError(data.message || data.error);
  return data;
}

export async function restoreSession() {
  if (!settings.authSession || !settings.gasEndpoint) return null;
  try {
    const { user } = await authCall('me');
    saveSettings({ authUser: user }); return user;
  } catch { saveSettings({ authSession: '', authUser: null }); return null; }
}
export async function login(id, password) {
  const { session, user } = await authCall('login', { id, password }, { session: false });
  saveSettings({ authSession: session, authUser: user, adapter: 'gas' }); return user;
}
export const register = (values) => authCall('register', values, { session: false });
export const bootstrapAdmin = (values) => authCall('bootstrapAdmin', values, { session: false });
export async function logout() {
  try { if (settings.authSession) await authCall('logout'); } catch { /* noop */ }
  saveSettings({ authSession: '', authUser: null });
}
