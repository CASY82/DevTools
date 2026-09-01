/** DOM/템플릿 최소 유틸. 프레임워크 없이 안전한 문자열 렌더링을 담당한다. */

const AMP = /[&<>"']/g;
const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML 이스케이프. 모든 사용자 입력은 이 함수를 통과한다. */
export const esc = (v) => (v == null ? '' : String(v).replace(AMP, (c) => ENT[c]));

const RAW = Symbol('raw');
/** 이미 신뢰할 수 있는 HTML 조각을 그대로 삽입한다. */
export const raw = (s) => ({ [RAW]: String(s ?? '') });

function part(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (typeof v === 'object' && RAW in v) return v[RAW];
  return esc(v);
}

/** html`<div>${value}</div>` — 보간값은 기본 이스케이프, raw()만 원문 삽입. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return raw(out);
}

/** raw 객체 또는 문자열을 실제 HTML 문자열로 변환. */
export const toHtml = (v) => part(v);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 컨테이너에 렌더링. */
export function render(target, tpl) {
  target.innerHTML = toHtml(tpl);
  return target;
}

/**
 * 이벤트 위임. 컨테이너 교체와 무관하게 동작하므로 리스너 해제가 필요 없다.
 * on(root, 'click', '[data-act="save"]', (e, el) => ...)
 */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const el = e.target.closest?.(selector);
    if (el && root.contains(el)) handler(e, el);
  });
}

/** form 요소 값을 평문 객체로 수집. */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'file') out[el.name] = el.files?.[0] || null;
    else out[el.name] = el.value;
  }
  return out;
}
