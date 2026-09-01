import { html } from '../core/dom.js';
import { norm } from '../core/util.js';
import { SOURCES } from '../domain/schema.js';
import { feedItem, empty, pageHead } from './components.js';

/** 통합 Change Feed — Task 변경 · 에셋 버전 · Git 이벤트를 시간순으로 병합. */
export default {
  title: '변경 피드',

  render(ctx) {
    const { repo, projectId, search, query } = ctx;
    if (!projectId) return html`${pageHead('변경 피드')}${empty('프로젝트를 먼저 선택하세요.')}`;

    const active = query.source ? query.source.split(',').filter(Boolean) : [];
    const items = repo.feed({ projectId, sources: active, limit: 200 })
      .filter((i) => !search || norm(`${i.text} ${i.taskId} ${i.actor}`).includes(norm(search)));

    return html`
      ${pageHead('변경 피드', html`
        ${Object.values(SOURCES).map((s) => html`
          <button class="btn btn-sm ${active.includes(s.id) ? 'btn-primary' : ''}"
                  data-act="toggle-source" data-id="${s.id}">${s.icon} ${s.label}</button>`)}
        ${active.length ? html`<button class="btn btn-sm btn-ghost" data-act="clear">필터 해제</button>` : ''}`)}

      <div class="card">
        ${items.length
          ? html`<div class="feed">${items.map((i) => feedItem(i, repo))}</div>`
          : html`<p class="muted">표시할 변경 기록이 없습니다.</p>`}
      </div>`;
  },

  actions: {
    'toggle-source': (ctx, el) => {
      const current = new Set((ctx.query.source || '').split(',').filter(Boolean));
      current.has(el.dataset.id) ? current.delete(el.dataset.id) : current.add(el.dataset.id);
      ctx.setQuery({ source: current.size ? [...current].join(',') : null });
    },
    clear: (ctx) => ctx.setQuery({ source: null }),
  },
};
