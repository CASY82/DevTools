import { html } from '../core/dom.js';
import { norm, relTime } from '../core/util.js';
import { LOCK_STATE, isBinaryAsset } from '../domain/schema.js';
import { lockChip, chip, empty, pageHead, option, taskLink } from './components.js';
import { newAssetDialog, checkinDialog } from './dialogs.js';
import { confirmDialog, withToast } from '../core/ui.js';

/** 에셋 목록 · Exclusive Lock 운용 화면 (계획서 7·10장). */
export default {
  title: '에셋',

  render(ctx) {
    const { repo, projectId, search, query } = ctx;
    if (!projectId) return html`${pageHead('에셋')}${empty('프로젝트를 먼저 선택하세요.')}`;

    const { lock = '', task = '' } = query;
    const rows = repo.assets(projectId).filter((a) => {
      if (lock && a.lock_status !== lock) return false;
      if (task && a.task_id !== task) return false;
      if (!search) return true;
      return norm(`${a.name} ${a.path} ${a.task_id}`).includes(norm(search));
    });

    return html`
      ${pageHead('에셋', html`<button class="btn btn-primary" data-act="new-asset">에셋 등록</button>`)}

      <div class="callout" style="margin-bottom:16px">
        바이너리 에셋(psd · blend · fbx · wav …)은 Git 머지가 불가능하므로
        <strong>체크아웃 → 수정 → 체크인</strong> 순서의 Exclusive Lock 정책을 사용합니다.
      </div>

      <div class="toolbar">
        <label class="field">
          <span>락 상태</span>
          <select data-change="lock">
            ${option('', '전체', lock)}
            ${Object.values(LOCK_STATE).map((s) => option(s.id, s.label, lock))}
          </select>
        </label>
        <label class="field">
          <span>Task</span>
          <select data-change="task">
            ${option('', '전체', task)}
            ${repo.tasks(projectId).map((t) => option(t.id, `${t.id} · ${t.title}`, task))}
          </select>
        </label>
        <div class="spacer"></div>
        <span class="muted">${rows.length}건</span>
      </div>

      ${rows.length ? html`
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>파일</th><th>경로</th><th>버전</th><th>상태</th><th>Task</th><th>수정</th><th></th></tr>
            </thead>
            <tbody>
              ${rows.map((a) => html`
                <tr>
                  <td>
                    <a href="#/assets/${a.id}">${a.name}</a>
                    ${isBinaryAsset(a.name) ? chip('binary', 'gray') : ''}
                  </td>
                  <td class="mono" style="font-size:12px">${a.path || '-'}</td>
                  <td class="mono">v${a.current_version}</td>
                  <td>
                    ${lockChip(a.lock_status)}
                    ${a.lock_status === 'CHECKED_OUT'
                      ? html`<small class="muted"> ${repo.memberName(a.locked_by)}</small>` : ''}
                  </td>
                  <td>${a.task_id ? taskLink(a.task_id) : html`<span class="muted">-</span>`}</td>
                  <td class="muted" style="font-size:12.5px">${relTime(a.updated_at)}</td>
                  <td>
                    <div class="row" style="gap:6px;flex-wrap:nowrap">
                      ${a.lock_status === 'AVAILABLE'
                        ? html`<button class="btn btn-sm" data-act="checkout" data-id="${a.id}">체크아웃</button>`
                        : html`
                          ${a.locked_by === ctx.actorId
                            ? html`<button class="btn btn-sm btn-primary" data-act="checkin" data-id="${a.id}">체크인</button>` : ''}
                          <button class="btn btn-sm" data-act="unlock" data-id="${a.id}">해제</button>`}
                      <button class="btn btn-sm btn-ghost" data-act="delete" data-id="${a.id}" title="삭제">✕</button>
                    </div>
                  </td>
                </tr>`)}
            </tbody>
          </table>
        </div>`
        : empty('등록된 에셋이 없습니다.', html`<button class="btn btn-primary" data-act="new-asset">에셋 등록</button>`)}`;
  },

  actions: {
    'new-asset': (ctx) => newAssetDialog(ctx),
    checkout: (ctx, el) => withToast(ctx.repo.checkout(el.dataset.id, ctx.actorId), '체크아웃했습니다.'),
    checkin: (ctx, el) => checkinDialog(ctx, ctx.repo.asset(el.dataset.id)),
    unlock: (ctx, el) => withToast(ctx.repo.unlock(el.dataset.id, ctx.actorId), '락을 해제했습니다.'),
    delete: async (ctx, el) => {
      const asset = ctx.repo.asset(el.dataset.id);
      if (await confirmDialog(`${asset.name} 과(와) 버전 이력을 모두 삭제할까요?`, { okLabel: '삭제', danger: true })) {
        await withToast(ctx.repo.deleteAsset(asset.id, ctx.actorId), '에셋을 삭제했습니다.');
      }
    },
  },

  changes: {
    lock: (ctx, el) => ctx.setQuery({ lock: el.value || null }),
    task: (ctx, el) => ctx.setQuery({ task: el.value || null }),
  },
};
