import { html, $$ } from '../core/dom.js';
import { norm } from '../core/util.js';
import { TASK_STATUS } from '../domain/schema.js';
import { avatar, priorityChip, empty, pageHead, option } from './components.js';
import { newTaskDialog } from './dialogs.js';
import { toastError } from '../core/ui.js';

/** 드래그 리스너를 이미 붙인 root. #view 는 재렌더에도 그대로라 중복 등록을 막아야 한다. */
const BOUND = new WeakSet();

/** 상태별 칸반 보드. 드래그&드롭으로 상태를 바꾸면 변경 로그가 남는다. */
export default {
  title: '보드',

  render(ctx) {
    const { repo, projectId, search, query } = ctx;
    if (!projectId) return html`${pageHead('보드')}${empty('프로젝트를 먼저 선택하세요.')}`;

    const assignee = query.assignee || '';
    const tasks = repo.tasks(projectId).filter((t) => {
      if (assignee && t.assignee_id !== assignee) return false;
      if (!search) return true;
      return norm(`${t.id} ${t.title} ${t.description}`).includes(norm(search));
    });

    return html`
      ${pageHead('보드', html`
        <label class="field" style="max-width:190px">
          <select data-change="assignee">
            ${option('', '담당자 전체', assignee)}
            ${repo.members.map((m) => option(m.id, m.name, assignee))}
          </select>
        </label>
        <button class="btn btn-primary" data-act="new-task">새 Task</button>`)}

      <div class="board" style="--cols:${TASK_STATUS.length}">
        ${TASK_STATUS.map((col) => {
          const items = tasks.filter((t) => t.status === col.id);
          return html`
            <section class="col" data-col="${col.id}">
              <div class="col-head">
                <b>${col.label}</b><span class="count">${items.length}</span>
              </div>
              ${items.map((t) => html`
                <article class="tcard" draggable="true" data-task="${t.id}">
                  <div class="between">
                    <a class="key" href="#/tasks/${t.id}">${t.id}</a>
                    ${priorityChip(t.priority)}
                  </div>
                  <div class="title">${t.title}</div>
                  <div class="meta">
                    <span class="muted" style="font-size:11.5px">${t.git_branch || ''}</span>
                    ${t.assignee_id ? avatar(repo.memberName(t.assignee_id)) : ''}
                  </div>
                </article>`)}
              ${items.length ? '' : html`<p class="muted" style="font-size:12.5px;text-align:center;padding:8px 0">비어 있음</p>`}
            </section>`;
        })}
      </div>`;
  },

  actions: {
    'new-task': (ctx) => newTaskDialog(ctx),
  },

  changes: {
    assignee: (ctx, el) => ctx.setQuery({ assignee: el.value || null }),
  },

  /**
   * HTML5 드래그&드롭.
   * root(#view)는 재렌더에도 살아남으므로 리스너는 root마다 한 번만 붙인다.
   * 매번 붙이면 리스너가 쌓이고, 다른 화면의 드롭(에셋 파일 드롭 등)까지 이 핸들러가 받는다.
   */
  mount(ctx, root) {
    if (BOUND.has(root)) return;
    BOUND.add(root);
    let dragging = null;

    root.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.tcard');
      if (!card) return;
      dragging = card.dataset.task;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragging);
    });

    root.addEventListener('dragend', () => {
      dragging = null;
      $$('.dragging', root).forEach((el) => el.classList.remove('dragging'));
      $$('.col.drop', root).forEach((el) => el.classList.remove('drop'));
    });

    root.addEventListener('dragover', (e) => {
      const col = e.target.closest('.col');
      if (!col) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      $$('.col.drop', root).forEach((el) => el !== col && el.classList.remove('drop'));
      col.classList.add('drop');
    });

    root.addEventListener('drop', async (e) => {
      const col = e.target.closest('.col');
      if (!col) return;                                   // 보드 밖(다른 화면)의 드롭은 건드리지 않는다
      const taskId = dragging || e.dataTransfer?.getData('text/plain');
      if (!taskId) return;
      e.preventDefault();
      col.classList.remove('drop');
      const status = col.dataset.col;
      const task = ctx.repo.task(taskId);
      if (!task || task.status === status) return;
      try { await ctx.repo.updateTask(taskId, { status }, ctx.actorId); }
      catch (err) { toastError(err); }
    });
  },
};
