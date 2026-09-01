import { AdapterError, assertExpected, ConflictError } from './base.js';

const KEY = (ns, table) => `${ns}:${table}`;

/**
 * 브라우저 localStorage 어댑터. 기본값이며 네트워크 없이 전체 기능이 동작한다.
 * GitHub Pages 데모 및 오프라인 사용을 담당한다.
 */
export class LocalAdapter {
  static id = 'local';
  static label = '브라우저 저장소';

  constructor({ namespace = 'gdh' } = {}) {
    this.id = LocalAdapter.id;
    this.label = LocalAdapter.label;
    this.ns = namespace;
    this.remote = false;
  }

  async init() {
    try {
      localStorage.setItem(`${this.ns}:__probe`, '1');
      localStorage.removeItem(`${this.ns}:__probe`);
    } catch (e) {
      throw new AdapterError('localStorage를 사용할 수 없습니다(시크릿 모드일 수 있습니다).', e);
    }
  }

  /**
   * 매번 localStorage에서 읽는다. 인스턴스 캐시를 두면 다른 탭의 쓰기를 보지 못해
   * update()의 CAS(assertExpected)가 낡은 값으로 판정된다(정확성 문제라 캐시하지 않는다).
   */
  #read(table) {
    try {
      const rows = JSON.parse(localStorage.getItem(KEY(this.ns, table)) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  }

  #write(table, rows) {
    try {
      localStorage.setItem(KEY(this.ns, table), JSON.stringify(rows));
    } catch (e) {
      throw new AdapterError('저장 공간이 가득 찼습니다. 설정에서 데이터를 내보낸 뒤 정리하세요.', e);
    }
  }

  async list(table) {
    return this.#read(table).map((r) => ({ ...r }));
  }

  async insert(table, row) {
    const rows = this.#read(table);
    if (rows.some((r) => r.id === row.id)) throw new ConflictError('이미 존재하는 ID입니다: ' + row.id);
    this.#write(table, [...rows, row]);
    return { ...row };
  }

  async update(table, id, patch, { expect } = {}) {
    const rows = this.#read(table);
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) throw new AdapterError(`${table} 레코드를 찾을 수 없습니다: ${id}`);
    assertExpected(rows[i], expect);
    const next = { ...rows[i], ...patch };
    const copy = rows.slice();
    copy[i] = next;
    this.#write(table, copy);
    return { ...next };
  }

  async remove(table, id) {
    this.#write(table, this.#read(table).filter((r) => r.id !== id));
  }

  async replaceAll(table, rows) {
    this.#write(table, rows.map((r) => ({ ...r })));
  }
}
