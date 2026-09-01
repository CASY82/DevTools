import { html } from '../core/dom.js';
import { fmtDate, relTime } from '../core/util.js';
import { TASK_STATUS } from '../domain/schema.js';
import { statusChip, priorityChip, lockChip, who, feedItem, empty, option, chip } from './components.js';
import { editTaskDialog, deleteTaskDialog, newAssetDialog, checkinDialog, linkGitDialog } from './dialogs.js';
import { confirmDialog, withToast } from '../core/ui.js';

/** Task 상세 — 계획서 5장 "한 화면에서 Task + Asset + Git" 을 구현한 화면. */
export default {
  title: 'Task 상세',

  render(ctx) {
    const { repo, params } = ctx;
    const task = repo.task(params.id);
    if (!task) return empty(`Task를 찾을 수 없습니다: ${params.id}`, html`<a class="btn" href="#/tasks">목록으로</a>`);

    const project = repo.project(task.project_id);
    const feature = repo.features(task.project_id).find((f) => f.id === task.feature_id);
    const assets = repo.assets(task.project_id, task.id);
    const links = repo.gitLinks(task.project_id, task.id);
    const activity = repo.feed({ projectId: task.project_id, limit: 200 }).filter((i) => i.taskId === task.id).slice(0, 30);

    return html`
      <div class="between" style="margin-bottom:14px">
        <div style="min-width:0">
          <div class="row" style="gap:8px">
            <a href="#/tasks" class="muted">← 태스크</a>
            <span class="mono" style="color:var(--accent)">${task.id}</span>
            ${statusChip(task.status)}${priorityChip(task.priority)}
          </div>
          <h1 style="margin-top:8px">${task.title}</h1>
        </div>
        <div class="row">
          <select data-change="status" style="width:150px">
            ${TASK_STATUS.map((s) => option(s.id, s.label, task.status))}
          </select>
          <button class="btn" data-act="edit">편집</button>
          <button class="btn btn-danger" data-act="delete">삭제</button>
        </div>
      </div>

      <div class="grid g2">
        <div class="stack">
          <div class="card">
            <h3>설명</h3>
            ${task.description
              ? html`<pre class="flow" style="background:transparent;border:none;padding:0">${task.description}</pre>`
              : html`<p class="muted">설명이 없습니다.</p>`}
          </div>

          <div class="card">
            <div class="between"><h3>연결 에셋 (${assets.length})</h3>
              <button class="btn btn-sm" data-act="new-asset">에셋 등록</button></div>
            ${assets.length ? html`
              <div class="stack" style="gap:12px;margin-top:8px">
                ${assets.map((a) => assetRow(a, repo, ctx))}
              </div>`
              : html`<p class="muted">연결된 에셋이 없습니다.</p>`}
          </div>

          <div class="card">
            <div class="between"><h3>Git 연결 (${links.length})</h3>
              <button class="btn btn-sm" data-act="link-git">수동 연결</button></div>
            ${links.length ? html`
              <div class="stack" style="gap:10px;margin-top:8px">
                ${links.map((g) => html`
                  <div class="between" style="gap:10px">
                    <div style="min-width:0">
                      <div>
                        ${chip(g.event_type === 'GIT_PR' ? `PR #${g.pull_request_no}` : (g.commit_sha || '').slice(0, 7) || 'Git', 'purple')}
                        ${g.url ? html`<a href="${g.url}" target="_blank" rel="noopener">${g.message || '(제목 없음)'}</a>` : html`<span>${g.message || '(제목 없음)'}</span>`}
                      </div>
                      <small class="muted">${g.repository || '-'} · ${g.branch || '-'} · ${g.author || '-'} · ${relTime(g.created_at)}</small>
                    </div>
                    <button class="btn btn-sm btn-ghost" data-act="unlink-git" data-id="${g.id}" title="연결 해제">✕</button>
                  </div>`)}
              </div>`
              : html`<p class="muted">연결된 Commit/PR이 없습니다. Git 연동 화면에서 자동으로 가져올 수 있습니다.</p>`}
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <h3>세부 정보</h3>
            <dl class="kv">
              <dt>프로젝트</dt><dd>${project?.name || '-'}</dd>
              <dt>Feature</dt><dd>${feature ? `${feature.name}${feature.milestone ? ` · ${feature.milestone}` : ''}` : '미지정'}</dd>
              <dt>담당자</dt><dd>${task.assignee_id ? who(repo.memberName(task.assignee_id)) : '미지정'}</dd>
              <dt>브랜치</dt><dd class="mono">${task.git_branch || '-'}</dd>
              <dt>PR</dt><dd class="mono">${task.git_pr ? `#${task.git_pr}` : '-'}</dd>
              <dt>생성</dt><dd>${fmtDate(task.created_at)}</dd>
              <dt>수정</dt><dd>${fmtDate(task.updated_at)}</dd>
            </dl>
          </div>

          <div class="card">
            <h3>활동</h3>
            ${activity.length
              ? html`<div class="feed">${activity.map((i) => feedItem(i, repo))}</div>`
              : html`<p class="muted">기록이 없습니다.</p>`}
          </div>
        </div>
      </div>`;
  },

  actions: {
    edit: async (ctx) => { await editTaskDialog(ctx, ctx.repo.task(ctx.params.id)); },
    delete: async (ctx) => {
      const ok = await deleteTaskDialog(ctx, ctx.repo.task(ctx.params.id));
      if (ok) ctx.go('/tasks');
    },
    'new-asset': (ctx) => newAssetDialog(ctx, { task_id: ctx.params.id }),
    'link-git': (ctx) => linkGitDialog(ctx, ctx.params.id),
    'unlink-git': async (ctx, el) => {
      if (await confirmDialog('이 Git 링크를 연결 해제할까요?', { okLabel: '해제', danger: true })) {
        await ctx.repo.removeGitLink(el.dataset.id);
      }
    },
    checkout: (ctx, el) => withToast(ctx.repo.checkout(el.dataset.id, ctx.actorId), '체크아웃했습니다.'),
    checkin: (ctx, el) => checkinDialog(ctx, ctx.repo.asset(el.dataset.id)),
    unlock: (ctx, el) => withToast(ctx.repo.unlock(el.dataset.id, ctx.actorId), '락을 해제했습니다.'),
    'open-asset': (ctx, el) => ctx.go(`/assets/${el.dataset.id}`),
  },

  changes: {
    status: (ctx, el) => ctx.repo.updateTask(ctx.params.id, { status: el.value }, ctx.actorId),
  },
};

function assetRow(a, repo, ctx) {
  const mine = a.locked_by === ctx.actorId;
  return html`
    <div class="between" style="gap:10px">
      <div style="min-width:0">
        <div>
          <a href="#/assets/${a.id}">${a.name}</a>
          <span class="muted mono"> v${a.current_version}</span>
          ${lockChip(a.lock_status)}
        </div>
        <small class="muted">${a.path || '-'}${a.lock_status === 'CHECKED_OUT' ? ` · ${repo.memberName(a.locked_by)} · ${relTime(a.locked_at)}` : ''}</small>
      </div>
      <div class="row" style="gap:6px">
        ${a.lock_status === 'AVAILABLE'
          ? html`<button class="btn btn-sm" data-act="checkout" data-id="${a.id}">체크아웃</button>`
          : html`
            ${mine ? html`<button class="btn btn-sm btn-primary" data-act="checkin" data-id="${a.id}">체크인</button>` : ''}
            <button class="btn btn-sm" data-act="unlock" data-id="${a.id}">락 해제</button>`}
      </div>
    </div>`;
}
