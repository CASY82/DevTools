import { html } from '../core/dom.js';
import { fmtDate, relTime } from '../core/util.js';
import { isBinaryAsset } from '../domain/schema.js';
import { lockChip, chip, who, taskLink, empty, taskOptions } from './components.js';
import { checkinDialog } from './dialogs.js';
import { withToast, openForm } from '../core/ui.js';

/** 에셋 상세 — 버전 이력과 락 상태 머신을 한 화면에서 다룬다. */
export default {
  title: '에셋 상세',

  render(ctx) {
    const { repo, params, actorId } = ctx;
    const a = repo.asset(params.id);
    if (!a) return empty(`에셋을 찾을 수 없습니다: ${params.id}`, html`<a class="btn" href="#/assets">목록으로</a>`);

    const versions = repo.versions(a.id);
    const locked = a.lock_status === 'CHECKED_OUT';
    const mine = a.locked_by === actorId;

    return html`
      <div class="between" style="margin-bottom:14px">
        <div style="min-width:0">
          <a href="#/assets" class="muted">← 에셋</a>
          <h1 style="margin-top:8px">${a.name} <span class="muted mono" style="font-size:18px">v${a.current_version}</span></h1>
          <div class="row" style="gap:8px">
            ${lockChip(a.lock_status)}
            ${isBinaryAsset(a.name) ? chip('binary · Exclusive Lock', 'gray') : chip('text', 'blue')}
            ${a.task_id ? taskLink(a.task_id) : ''}
          </div>
        </div>
        <div class="row">
          ${locked
            ? html`
              ${mine ? html`<button class="btn btn-primary" data-act="checkin">체크인</button>` : ''}
              <button class="btn" data-act="unlock">락 해제</button>`
            : html`<button class="btn btn-primary" data-act="checkout">체크아웃</button>`}
          <button class="btn" data-act="edit">편집</button>
        </div>
      </div>

      ${locked ? html`
        <div class="callout" data-tone="warn" style="margin-bottom:16px">
          ${who(repo.memberName(a.locked_by))} 님이 ${relTime(a.locked_at)} 체크아웃했습니다.
          ${mine ? '작업을 마치면 체크인해 새 버전을 만드세요.' : '동시 수정을 피하려면 체크인될 때까지 기다리세요.'}
        </div>` : ''}

      <div class="grid g2">
        <div class="card">
          <h3>메타데이터</h3>
          <dl class="kv">
            <dt>경로</dt><dd class="mono">${a.path || '-'}</dd>
            <dt>현재 버전</dt><dd>v${a.current_version}</dd>
            <dt>해시</dt><dd class="mono" style="word-break:break-all">${a.hash || '-'}</dd>
            <dt>Drive File ID</dt><dd class="mono">${a.drive_file_id || '-'}</dd>
            <dt>Drive 링크</dt>
            <dd>${a.drive_link ? html`<a href="${a.drive_link}" target="_blank" rel="noopener">열기</a>` : '-'}</dd>
            <dt>연결 Task</dt><dd>${a.task_id ? taskLink(a.task_id) : '연결 없음'}</dd>
            <dt>최근 수정</dt><dd>${fmtDate(a.updated_at)}</dd>
          </dl>
        </div>

        <div class="card">
          <h3>버전 이력 (${versions.length})</h3>
          ${versions.length ? html`
            <ul class="timeline" style="margin-top:10px">
              ${versions.map((v) => html`
                <li>
                  <div class="between">
                    <strong>v${v.version_no}</strong>
                    <small class="muted" title="${fmtDate(v.created_at)}">${relTime(v.created_at)}</small>
                  </div>
                  <div>${v.comment}</div>
                  <small class="muted">${repo.memberName(v.author_id)} · <span class="mono">${String(v.hash).slice(0, 12)}</span>${v.drive_revision_id ? ` · ${v.drive_revision_id}` : ''}</small>
                </li>`)}
            </ul>`
            : html`<p class="muted">아직 버전이 없습니다. 체크아웃 후 체크인하면 v1이 생성됩니다.</p>`}
        </div>
      </div>`;
  },

  actions: {
    checkout: (ctx) => withToast(ctx.repo.checkout(ctx.params.id, ctx.actorId), '체크아웃했습니다.'),
    checkin: (ctx) => checkinDialog(ctx, ctx.repo.asset(ctx.params.id)),
    unlock: (ctx) => withToast(ctx.repo.unlock(ctx.params.id, ctx.actorId), '락을 해제했습니다.'),
    edit: async (ctx) => {
      const a = ctx.repo.asset(ctx.params.id);
      const values = await openForm({
        title: '에셋 편집',
        fields: [
          { name: 'name', label: '파일명', required: true, value: a.name },
          { name: 'path', label: '경로', value: a.path },
          { name: 'task_id', label: '연결 Task', type: 'select', value: a.task_id, options: taskOptions(ctx.repo, a.project_id) },
          { name: 'drive_link', label: 'Drive 링크', value: a.drive_link },
          { name: 'drive_file_id', label: 'Drive File ID', value: a.drive_file_id },
        ],
      });
      if (values) await withToast(ctx.repo.updateAsset(a.id, values), '에셋 정보를 저장했습니다.');
    },
  },
};
