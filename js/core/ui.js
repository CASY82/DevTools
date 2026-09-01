import { $, html, toHtml, formData } from './dom.js';

const toastRoot = () => $('#toasts');
const modalRoot = () => $('#modal-root');

/** 우하단 토스트. tone: ok | err | info */
export function toast(message, tone = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.tone = tone;
  el.textContent = String(message);
  toastRoot().appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, ms);
}

export const toastError = (e) => {
  console.error(e);
  toast(e?.message || String(e), 'err', 5000);
};

/** 비동기 작업을 토스트로 감싼다. 성공/실패 메시지를 자동 처리. */
export async function withToast(promise, okMessage) {
  try {
    const result = await promise;
    if (okMessage) toast(okMessage, 'ok');
    return result;
  } catch (e) {
    toastError(e);
    return null;
  }
}

function closeModal() {
  const root = modalRoot();
  root.hidden = true;
  root.innerHTML = '';
}

/**
 * 모달을 띄우고 결과를 Promise로 돌려준다.
 * body에 form이 있으면 submit 시 form 값이 resolve 된다. 취소/배경 클릭은 null.
 */
export function openModal({ title, body, actions, wide = false, onMount } = {}) {
  return new Promise((resolve) => {
    const root = modalRoot();
    root.hidden = false;
    root.innerHTML = toHtml(html`
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
        <h3>${title}</h3>
        <div class="modal-body">${body}</div>
        ${actions ? html`<div class="modal-actions">${actions}</div>` : ''}
      </div>`);

    const done = (value) => { cleanup(); closeModal(); resolve(value); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    const onClick = (e) => {
      if (e.target === root) return done(null);
      const btn = e.target.closest('[data-close]');
      if (btn) done(btn.dataset.close === 'true' ? true : null);
    };
    const onSubmit = (e) => { e.preventDefault(); done(formData(e.target)); };
    const cleanup = () => {
      document.removeEventListener('keydown', onKey);
      root.removeEventListener('click', onClick);
      root.removeEventListener('submit', onSubmit);
    };

    document.addEventListener('keydown', onKey);
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    onMount?.(root, done);
    root.querySelector('input,select,textarea,button')?.focus();
  });
}

export function confirmDialog(message, { title = '확인', okLabel = '확인', danger = false } = {}) {
  return openModal({
    title,
    body: html`<p>${message}</p>`,
    actions: html`
      <button type="button" class="btn" data-close>취소</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-close="true">${okLabel}</button>`,
  }).then(Boolean);
}

/**
 * 필드 정의로 폼 모달을 만든다.
 * field: { name, label, type, value, options, required, placeholder, hint, rows, accept }
 */
export function openForm({ title, fields, submitLabel = '저장', wide = false }) {
  const body = html`
    <form id="modal-form" class="stack" style="gap:14px">
      ${fields.map(fieldMarkup)}
      <div class="modal-actions">
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn btn-primary">${submitLabel}</button>
      </div>
    </form>`;
  return openModal({ title, body, wide });
}

function fieldMarkup(f) {
  if (f.type === 'hidden') return html`<input type="hidden" name="${f.name}" value="${f.value ?? ''}" />`;
  const control = (() => {
    switch (f.type) {
      case 'textarea':
        return html`<textarea name="${f.name}" rows="${f.rows || 4}" placeholder="${f.placeholder || ''}"
          ${f.required ? 'required' : ''}>${f.value ?? ''}</textarea>`;
      case 'select':
        return html`<select name="${f.name}" ${f.required ? 'required' : ''}>
          ${(f.options || []).map((o) => html`<option value="${o.value}" ${String(o.value) === String(f.value ?? '') ? 'selected' : ''}>${o.label}</option>`)}
        </select>`;
      case 'file':
        return html`<input type="file" name="${f.name}" accept="${f.accept || '*/*'}" />`;
      default:
        return html`<input type="${f.type || 'text'}" name="${f.name}" value="${f.value ?? ''}"
          placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''} />`;
    }
  })();
  return html`<label class="field">
    <span>${f.label}${f.required ? ' *' : ''}</span>
    ${control}
    ${f.hint ? html`<small>${f.hint}</small>` : ''}
  </label>`;
}

export { closeModal };
