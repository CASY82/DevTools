import { AdapterError, ConflictError } from './base.js';

/**
 * Google Apps Script 웹앱 어댑터.
 * Sheets = DB, Drive = 에셋 저장소 역할을 하며 apps-script/Code.gs와 짝을 이룬다.
 *
 * CORS 프리플라이트를 피하기 위해 text/plain 본문으로 POST 한다(GAS는 OPTIONS 미지원).
 */
export class GasAdapter {
  static id = 'gas';
  static label = 'Google Sheets (Apps Script)';

  constructor({ endpoint, token = '', session = '' } = {}) {
    this.id = GasAdapter.id;
    this.label = GasAdapter.label;
    this.endpoint = (endpoint || '').trim();
    this.token = (token || '').trim();
    this.session = (session || '').trim();
    this.remote = true;
  }

  async init() {
    if (!this.endpoint) throw new AdapterError('Apps Script 웹앱 URL이 설정되지 않았습니다.');
    const res = await this.#call('ping', {});
    if (res?.ok !== true) throw new AdapterError('Apps Script 응답이 올바르지 않습니다.');
  }

  async #call(action, payload) {
    let res;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, session: this.session, token: this.token, ...payload }),
        redirect: 'follow',
      });
    } catch (e) {
      throw new AdapterError('Apps Script 연결에 실패했습니다. URL과 배포 권한을 확인하세요.', e);
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new AdapterError('Apps Script가 JSON이 아닌 응답을 반환했습니다(로그인 리다이렉트일 수 있습니다).', e); }
    if (data.error) {
      if (data.error === 'CONFLICT') throw new ConflictError(data.message);
      throw new AdapterError(data.message || data.error);
    }
    return data;
  }

  async list(table) { return (await this.#call('list', { table })).rows || []; }
  async insert(table, row) { return (await this.#call('insert', { table, row })).row; }
  async update(table, id, patch, { expect } = {}) {
    return (await this.#call('update', { table, id, patch, expect })).row;
  }
  async remove(table, id) { await this.#call('remove', { table, id }); }
  async replaceAll(table, rows) { await this.#call('replaceAll', { table, rows }); }

  /** Drive 업로드(선택 기능). 파일을 base64로 전송한다. */
  async uploadAsset(file, meta) {
    const data = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1]);
      fr.onerror = () => reject(new AdapterError('파일을 읽지 못했습니다.'));
      fr.readAsDataURL(file);
    });
    return (await this.#call('upload', {
      name: file.name, mimeType: file.type || 'application/octet-stream', data, meta,
    })).file;
  }
}
