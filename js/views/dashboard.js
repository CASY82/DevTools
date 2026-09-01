import { html } from '../core/dom.js';
import { pct } from '../core/util.js';
import { chip, statusChip, priorityChip, taskLink, feedItem, statusBars, empty, pageHead, who, relTime } from './components.js';
import { newTaskDialog, newAssetDialog } from './dialogs.js';

export default {
  title: '대시보드',

  render(ctx) {
    const { repo, projectId, actorId } = ctx;
    const project = repo.project(projectId);
    if (!project) {
      return html`${pageHead('대시보드')}
        ${empty('프로젝트가 없습니다. 설정에서 프로젝트를 만들거나 데모 데이터를 넣어보세요.',
          html`<a class="btn btn-primary" href="#/settings">설정으로 이동</a>`)}`;
    }

    const s = repo.stats(projectId);
    const mine = repo.tasks(projectId).filter((t) => t.assignee_id === actorId && t.status !== 'DONE').slice(0, 6);
    const locked = repo.assets(projectId).filter((a) => a.lock_status === 'CHECKED_OUT');
    const feed = repo.feed({ projectId, limit: 8 });

    return html`
      ${pageHead(project.name, html`
        <button class="btn" data-act="new-asset">에셋 등록</button>
        <button class="btn btn-primary" data-act="new-task">새 Task</button>`)}

      <div class="grid g4">
        ${kpi('전체 Task', s.tasks, `완료 ${s.done}`)}
        ${kpi('진행 중', s.inProgress, `긴급 ${s.critical}`)}
        ${kpi('완료율', `${pct(s.done, s.tasks)}%`, `${s.done}/${s.tasks}`)}
        ${kpi('체크아웃 에셋', s.locked, `전체 ${s.assets}`)}
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="card">
          <h3>상태 분포</h3>
          ${s.tasks ? statusBars(s.byStatus, s.tasks) : html`<p class="muted">Task가 없습니다.</p>`}
          <div class="row" style="margin-top:16px">
            ${chip(`Git 링크 ${s.gitLinks}`, 'purple')}
            ${chip(`에셋 ${s.assets}`, 'green')}
            ${project.repository ? chip(project.repository, 'blue') : ''}
          </div>
        </div>

        <div class="card">
          <div class="between"><h3>내 작업</h3><a href="#/board">보드 열기</a></div>
          ${mine.length ? html`
            <div class="stack" style="gap:10px;margin-top:6px">
              ${mine.map((t) => html`
                <div class="between" style="gap:10px">
                  <div style="min-width:0">
                    ${taskLink(t.id)} <span>${t.title}</span>
                  </div>
                  <div class="row" style="gap:6px">${priorityChip(t.priority)}${statusChip(t.status)}</div>
                </div>`)}
            </div>`
            : html`<p class="muted">담당으로 지정된 미완료 Task가 없습니다.</p>`}
        </div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="card">
          <div class="between"><h3>체크아웃 중인 에셋</h3><a href="#/assets">에셋 전체</a></div>
          ${locked.length ? html`
            <div class="stack" style="gap:12px;margin-top:6px">
              ${locked.map((a) => html`
                <div class="between">
                  <div>
                    <div>${a.name} <span class="muted mono">v${a.current_version}</span></div>
                    <small class="muted">${a.path || '-'}</small>
                  </div>
                  <div class="row" style="gap:8px">
                    ${who(repo.memberName(a.locked_by))}
                    <small class="muted">${relTime(a.locked_at)}</small>
                    <button class="btn btn-sm" data-act="unlock" data-id="${a.id}">락 해제</button>
                  </div>
                </div>`)}
            </div>`
            : html`<p class="muted">잠긴 에셋이 없습니다. 모든 파일이 편집 가능합니다.</p>`}
        </div>

        <div class="card">
          <div class="between"><h3>최근 변경</h3><a href="#/feed">전체 피드</a></div>
          ${feed.length
            ? html`<div class="feed">${feed.map((i) => feedItem(i, repo))}</div>`
            : html`<p class="muted">기록된 변경이 없습니다.</p>`}
        </div>
      </div>`;
  },

  actions: {
    'new-task': (ctx) => newTaskDialog(ctx),
    'new-asset': (ctx) => newAssetDialog(ctx),
    unlock: (ctx, el) => ctx.repo.unlock(el.dataset.id, ctx.actorId),
  },
};

const kpi = (label, value, sub) => html`
  <div class="card kpi">
    <span>${label}</span>
    <b>${value}</b>
    <small class="muted">${sub}</small>
  </div>`;
