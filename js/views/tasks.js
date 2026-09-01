import { html } from '../core/dom.js';
import { norm, fmtDate } from '../core/util.js';
import { TASK_STATUS } from '../domain/schema.js';
import { priorityChip, who, empty, pageHead, option } from './components.js';
import { newTaskDialog } from './dialogs.js';

/** Task 목록. 상태는 표 안에서 바로 바꿀 수 있다. */
export default {
  title: '태스크',

  render(ctx) {
    const { repo, projectId, search, query } = ctx;
    if (!projectId) return html`${pageHead('태스크')}${empty('프로젝트를 먼저 선택하세요.')}`;

    const { status = '', assignee = '' } = query;
    const rows = repo.tasks(projectId).filter((t) => {
      if (status && t.status !== status) return false;
      if (assignee && t.assignee_id !== assignee) return false;
      if (!search) return true;
      return norm(`${t.id} ${t.title} ${t.description} ${t.git_branch}`).includes(norm(search));
    });

    return html`
      ${pageHead('태스크', html`<button class="btn btn-primary" data-act="new-task">새 Task</button>`)}

      <div class="toolbar">
        <label class="field">
          <span>상태</span>
          <select data-change="status">
            ${option('', '전체', status)}${TASK_STATUS.map((s) => option(s.id, s.label, status))}
          </select>
        </label>
        <label class="field">
          <span>담당자</span>
          <select data-change="assignee">
            ${option('', '전체', assignee)}${repo.members.map((m) => option(m.id, m.name, assignee))}
          </select>
        </label>
        <div class="spacer"></div>
        <span class="muted">${rows.length}건</span>
      </div>

      ${rows.length ? html`
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>제목</th><th>상태</th><th>우선순위</th><th>담당자</th><th>Git</th><th>에셋</th><th>수정</th></tr>
            </thead>
            <tbody>
              ${rows.map((t) => html`
                <tr class="clickable" data-act="open" data-id="${t.id}">
                  <td class="mono">${t.id}</td>
                  <td>${t.title}</td>
                  <td>
                    <select data-change="status-of" data-id="${t.id}" data-stop>
                      ${TASK_STATUS.map((s) => option(s.id, s.label, t.status))}
                    </select>
                  </td>
                  <td>${priorityChip(t.priority)}</td>
                  <td>${t.assignee_id ? who(repo.memberName(t.assignee_id)) : html`<span class="muted">미지정</span>`}</td>
                  <td class="mono" style="font-size:12px">
                    ${t.git_branch || '-'}${t.git_pr ? html` · <span>#${t.git_pr}</span>` : ''}
                  </td>
                  <td>${repo.assets(projectId, t.id).length}</td>
                  <td class="muted" style="font-size:12.5px">${fmtDate(t.updated_at, false)}</td>
                </tr>`)}
            </tbody>
          </table>
        </div>`
        : empty('조건에 맞는 Task가 없습니다.')}`;
  },

  actions: {
    'new-task': (ctx) => newTaskDialog(ctx),
    open: (ctx, el) => ctx.go(`/tasks/${el.dataset.id}`),
  },

  changes: {
    status: (ctx, el) => ctx.setQuery({ status: el.value || null }),
    assignee: (ctx, el) => ctx.setQuery({ assignee: el.value || null }),
    'status-of': (ctx, el) => ctx.repo.updateTask(el.dataset.id, { status: el.value }, ctx.actorId),
  },
};
