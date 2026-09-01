import { html } from '../core/dom.js';
import { initials, fmtDate, relTime, pct } from '../core/util.js';
import { statusMeta, priorityMeta, lockMeta, sourceMeta, eventLabel, TASK_STATUS, PRIORITY } from '../domain/schema.js';

export const chip = (label, tone = 'gray') => html`<span class="chip" data-tone="${tone}">${label}</span>`;
export const statusChip = (id) => chip(statusMeta(id).label, statusMeta(id).tone);
export const priorityChip = (id) => chip(priorityMeta(id).label, priorityMeta(id).tone);
export const lockChip = (id) => chip(lockMeta(id).label, lockMeta(id).tone);

export const avatar = (name) => html`<span class="avatar" title="${name}">${initials(name)}</span>`;

export const who = (name) => html`<span class="who">${avatar(name)}${name}</span>`;

export const taskLink = (id, label) =>
  html`<a class="mono" href="#/tasks/${id}">${label ?? id}</a>`;

export const empty = (message, actionHtml) =>
  html`<div class="empty"><p>${message}</p>${actionHtml || ''}</div>`;

export const pageHead = (title, right) => html`
  <div class="between" style="margin-bottom:18px">
    <h1>${title}</h1>
    <div class="row">${right || ''}</div>
  </div>`;

export const option = (value, label, selected) =>
  html`<option value="${value}" ${String(selected ?? '') === String(value) ? 'selected' : ''}>${label}</option>`;

export const statusOptions = (selected) => TASK_STATUS.map((s) => ({ value: s.id, label: s.label, selected: s.id === selected }));
export const priorityOptions = (selected) => PRIORITY.map((p) => ({ value: p.id, label: p.label, selected: p.id === selected }));
export const memberOptions = (repo, { includeEmpty = '미지정' } = {}) => [
  ...(includeEmpty ? [{ value: '', label: includeEmpty }] : []),
  ...repo.members.map((m) => ({ value: m.id, label: `${m.name} · ${m.role}` })),
];
export const taskOptions = (repo, projectId, { includeEmpty = '연결 없음' } = {}) => [
  ...(includeEmpty ? [{ value: '', label: includeEmpty }] : []),
  ...repo.tasks(projectId).map((t) => ({ value: t.id, label: `${t.id} · ${t.title}` })),
];

/** 통합 피드 아이템 렌더링 (대시보드/피드/태스크 상세 공용). */
export const feedItem = (item, repo) => {
  const src = sourceMeta(item.source);
  return html`
    <div class="feed-item">
      <div class="feed-icon" title="${src.label}">${src.icon}</div>
      <div class="feed-body">
        <div class="t">${item.url ? html`<a href="${item.url}" target="_blank" rel="noopener">${item.text}</a>` : item.text}</div>
        <div class="s">
          ${chip(eventLabel(item.event), src.tone)}
          ${item.taskId ? taskLink(item.taskId) : ''}
          <span>${item.actor}</span>
          <span title="${fmtDate(item.at)}">${relTime(item.at)}</span>
        </div>
      </div>
    </div>`;
};

/** 상태별 분포 막대. */
export const statusBars = (byStatus, total) => html`
  <div class="stack" style="gap:10px">
    ${TASK_STATUS.map((s) => {
      const n = byStatus[s.id] || 0;
      return html`
        <div>
          <div class="between" style="font-size:12.5px;margin-bottom:4px">
            <span>${s.label}</span><span class="muted">${n} · ${pct(n, total)}%</span>
          </div>
          <div class="bar"><i style="width:${pct(n, total)}%"></i></div>
        </div>`;
    })}
  </div>`;

export { fmtDate, relTime };
