import { html } from '../core/dom.js';
import { norm, relTime, pickFiles } from '../core/util.js';
import { LOCK_STATE, isBinaryAsset, isImageAsset, thumbUrl, MAX_UPLOAD_MB } from '../domain/schema.js';
import { lockChip, chip, empty, pageHead, option, taskLink } from './components.js';
import { newAssetDialog, checkinDialog } from './dialogs.js';
import { confirmDialog, withToast, toast, toastError } from '../core/ui.js';

/**
 * 드롭·선택 공통 업로드 경로. 파일당 에셋 1개(v1)를 만든다.
 * 한 파일이 실패해도 나머지는 계속 올리고, 실패는 개별 토스트로 알린다.
 */
async function uploadFiles(ctx, files) {
  const { repo, projectId } = ctx;
  if (!projectId) return toast('프로젝트를 먼저 선택하세요.', 'err');
  const taskId = ctx.query.task || '';        // Task 필터가 걸려 있으면 그 Task에 연결한다
  let done = 0;
  for (const file of files) {
    try {
      await repo.uploadNewAsset(projectId, file, { taskId, actorId: ctx.actorId });
      done++;
    } catch (e) {
      toastError(e);
    }
  }
  if (done) toast(`${done}개 파일을 Drive에 올렸습니다.`, 'ok');
}

const thumb = (asset) => (isImageAsset(asset.name) && asset.drive_file_id
  ? html`<img class="thumb" src="${thumbUrl(asset.drive_file_id, 80)}" alt="${asset.name} 미리보기" loading="lazy">`
  : '');

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

      ${repo.canUpload ? html`
        <div class="dropzone" data-drop="upload">
          <div class="dz-title">파일을 여기에 끌어다 놓으세요</div>
          <p class="muted">Drive에 바로 올라가고 <strong>v1 에셋</strong>으로 등록됩니다. 여러 개도 됩니다.</p>
          <button class="btn btn-sm" data-act="pick-files">파일 선택</button>
          <small class="muted">
            파일당 최대 ${MAX_UPLOAD_MB}MB${task ? html` · <span class="mono">${task}</span> 에 연결됩니다` : ''}
          </small>
        </div>`
        : html`
        <div class="callout" data-tone="warn" style="margin-bottom:16px">
          현재 저장소(<strong>${repo.adapter.label}</strong>)는 파일 업로드를 지원하지 않습니다.
          파일 본문을 브라우저에 저장하지 않기 때문이며, 설정에서 Apps Script 저장소로 전환하면
          끌어다 놓기로 Drive에 바로 올릴 수 있습니다.
        </div>`}

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
                    <div class="row" style="gap:8px;flex-wrap:nowrap">
                      ${thumb(a)}
                      <span>
                        <a href="#/assets/${a.id}">${a.name}</a>
                        ${isBinaryAsset(a.name) ? chip('binary', 'gray') : ''}
                      </span>
                    </div>
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
    'pick-files': async (ctx) => { const files = await pickFiles(); if (files.length) await uploadFiles(ctx, files); },
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

  drops: {
    upload: (ctx, files) => uploadFiles(ctx, files),
  },
};
