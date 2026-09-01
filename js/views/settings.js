import { html } from '../core/dom.js';
import { download, pickFile, fmtDate } from '../core/util.js';
import { settings, saveSettings } from '../core/store.js';
import { authCall } from '../core/auth.js';
import { ADAPTERS } from '../adapters/index.js';
import { chip, empty, pageHead, option, who } from './components.js';
import { projectDialog, memberDialog } from './dialogs.js';
import { toast, toastError, withToast, confirmDialog } from '../core/ui.js';
import { seedData } from '../domain/seed.js';

/** 자동 동기화 주기 후보(초). 0은 사용 안 함. Apps Script 호출량 때문에 최소값을 30초로 둔다. */
const SYNC_OPTIONS = [[0, '사용 안 함'], [30, '30초마다'], [60, '1분마다'], [300, '5분마다']];

/** 설정 — 저장소 어댑터 전환, 연동 정보, 프로젝트/멤버, 데이터 관리. */
export default {
  title: '설정',

  render(ctx) {
    const { repo } = ctx;
    const gas = settings.adapter === 'gas';

    return html`
      ${pageHead('설정')}

      <div class="grid g2">
        <div class="card">
          <h3>저장소 어댑터</h3>
          <p class="muted">데이터를 어디에 저장할지 선택합니다. 도메인 로직은 동일하게 동작합니다.</p>
          <form data-submit="adapter" class="stack" style="gap:12px">
            <label class="field">
              <span>어댑터</span>
              <select name="adapter" data-change="adapter-kind">
                ${ADAPTERS.map((a) => option(a.id, a.label, settings.adapter))}
              </select>
            </label>
            <label class="field gas-only" ${gas ? '' : 'hidden'}>
              <span>Apps Script 웹앱 URL</span>
              <input name="gasEndpoint" value="${settings.gasEndpoint}" placeholder="https://script.google.com/macros/s/.../exec" />
            </label>
            <label class="field gas-only" ${gas ? '' : 'hidden'}>
              <span>공유 토큰</span>
              <input name="gasToken" value="${settings.gasToken}" placeholder="Code.gs의 SHARED_TOKEN과 동일하게" />
            </label>
            <div class="row">
              <button type="submit" class="btn btn-primary">연결 적용</button>
              ${chip(`현재: ${repo.adapter.label}`, 'blue')}
            </div>
          </form>
          <p class="muted" style="margin-top:12px;font-size:12.5px">
            Apps Script 백엔드 코드는 <span class="mono">apps-script/Code.gs</span> 에 포함되어 있습니다.
          </p>
          <!-- 어댑터 전환 폼을 다시 제출하지 않고 즉시 저장하기 위해 form 바깥에 둔다. -->
          <label class="field" style="margin-top:14px;max-width:220px">
            <span>자동 동기화</span>
            <select data-change="sync-seconds">
              ${SYNC_OPTIONS.map(([value, label]) => option(value, label, settings.syncSeconds))}
            </select>
            <small>탭이 활성 상태이고 입력·모달·드래그 중이 아닐 때만 실행됩니다.</small>
          </label>
        </div>

        <div class="card">
          <h3>GitHub 연동</h3>
          <p class="muted">정적 호스팅에서는 Webhook 대신 REST 폴링으로 Commit/PR을 가져옵니다.</p>
          <form data-submit="github" class="stack" style="gap:12px">
            <label class="field">
              <span>기본 저장소</span>
              <input name="githubRepo" value="${settings.githubRepo}" placeholder="owner/repo" />
            </label>
            <label class="field">
              <span>액세스 토큰 (선택)</span>
              <input name="githubToken" type="password" value="${settings.githubToken}" placeholder="ghp_..." />
              <small>비공개 저장소 또는 API 한도 상향에만 필요합니다. 토큰은 이 브라우저에만 저장됩니다.</small>
            </label>
            <div><button type="submit" class="btn btn-primary">저장</button></div>
          </form>
        </div>
      </div>

      ${settings.authUser?.role === 'admin' ? html`
        <div class="section-head"><h2>계정 승인</h2><button class="btn btn-sm" data-act="load-users">새로고침</button></div>
        <div id="user-admin" class="card"><p class="muted">계정 목록을 불러오려면 새로고침을 누르세요.</p></div>` : ''}

      <div class="section-head"><h2>프로젝트</h2>
        <button class="btn btn-sm btn-primary" data-act="new-project">새 프로젝트</button></div>
      ${repo.projects.length ? html`
        <div class="table-wrap">
          <table>
            <thead><tr><th>키</th><th>이름</th><th>Owner</th><th>저장소</th><th>Task</th><th>생성</th><th></th></tr></thead>
            <tbody>
              ${repo.projects.map((p) => html`
                <tr>
                  <td class="mono">${p.key}</td>
                  <td>${p.name}</td>
                  <td>${p.owner_id ? repo.memberName(p.owner_id) : '-'}</td>
                  <td class="mono" style="font-size:12px">${p.repository || '-'}</td>
                  <td>${repo.tasks(p.id).length}</td>
                  <td class="muted" style="font-size:12.5px">${fmtDate(p.created_at, false)}</td>
                  <td>
                    <div class="row" style="gap:6px;flex-wrap:nowrap">
                      <button class="btn btn-sm" data-act="edit-project" data-id="${p.id}">편집</button>
                      <button class="btn btn-sm btn-ghost" data-act="delete-project" data-id="${p.id}">✕</button>
                    </div>
                  </td>
                </tr>`)}
            </tbody>
          </table>
        </div>` : empty('프로젝트가 없습니다.')}

      <div class="section-head"><h2>멤버</h2>
        <button class="btn btn-sm" data-act="new-member">멤버 추가</button></div>
      ${repo.members.length ? html`
        <div class="table-wrap">
          <table>
            <thead><tr><th>이름</th><th>역할</th><th>이메일</th><th>GitHub</th><th></th></tr></thead>
            <tbody>
              ${repo.members.map((m) => html`
                <tr>
                  <td>${who(m.name)}</td>
                  <td>${m.role}</td>
                  <td class="muted">${m.email || '-'}</td>
                  <td class="mono" style="font-size:12px">${m.github_login || '-'}</td>
                  <td>
                    <div class="row" style="gap:6px;flex-wrap:nowrap">
                      <button class="btn btn-sm" data-act="edit-member" data-id="${m.id}">편집</button>
                      <button class="btn btn-sm btn-ghost" data-act="delete-member" data-id="${m.id}">✕</button>
                    </div>
                  </td>
                </tr>`)}
            </tbody>
          </table>
        </div>` : empty('등록된 멤버가 없습니다.')}

      <div class="section-head"><h2>데이터</h2></div>
      <div class="card">
        <div class="row">
          <button class="btn" data-act="export">JSON 내보내기</button>
          <button class="btn" data-act="import">가져오기 (병합)</button>
          <button class="btn" data-act="import-replace">가져오기 (덮어쓰기)</button>
          <button class="btn" data-act="seed">데모 데이터 넣기</button>
          <div class="spacer"></div>
          <button class="btn btn-danger" data-act="reset">전체 초기화</button>
        </div>
        <p class="muted" style="margin:12px 0 0;font-size:12.5px">
          내보낸 JSON은 Sheets 열 구성(<span class="mono">COLUMNS</span>)을 함께 담고 있어 백엔드 이전 시 그대로 사용할 수 있습니다.
        </p>
      </div>`;
  },

  actions: {
    'load-users': async () => renderUsers(await authCall('users')),
    'approve-user': async (_ctx, el) => { await authCall('setUserStatus', { userId: el.dataset.id, status: 'approved' }); renderUsers(await authCall('users')); toast('계정을 승인했습니다.', 'ok'); },
    'reject-user': async (_ctx, el) => { await authCall('setUserStatus', { userId: el.dataset.id, status: 'rejected' }); renderUsers(await authCall('users')); toast('계정 접근을 거절했습니다.', 'ok'); },
    'new-project': async (ctx) => {
      const p = await projectDialog(ctx);
      if (p) ctx.setProject(p.id);
    },
    'edit-project': (ctx, el) => projectDialog(ctx, ctx.repo.project(el.dataset.id)),
    'delete-project': async (ctx, el) => {
      const p = ctx.repo.project(el.dataset.id);
      const ok = await confirmDialog(`${p.name}(${p.key}) 프로젝트와 모든 Task·에셋·로그를 삭제할까요?`,
        { title: '프로젝트 삭제', okLabel: '삭제', danger: true });
      if (ok) await withToast(ctx.repo.deleteProject(p.id), '프로젝트를 삭제했습니다.');
    },
    'new-member': (ctx) => memberDialog(ctx),
    'edit-member': (ctx, el) => memberDialog(ctx, ctx.repo.member(el.dataset.id)),
    'delete-member': async (ctx, el) => {
      const m = ctx.repo.member(el.dataset.id);
      if (await confirmDialog(`${m.name} 님을 삭제할까요? 기존 기록의 담당자 표시는 '알 수 없음'이 됩니다.`,
        { okLabel: '삭제', danger: true })) {
        await withToast(ctx.repo.deleteMember(m.id), '멤버를 삭제했습니다.');
      }
    },

    export: (ctx) => {
      const stamp = new Date().toISOString().slice(0, 10);
      download(`gamedev-hub-${stamp}.json`, JSON.stringify(ctx.repo.export(), null, 2));
      toast('JSON을 내보냈습니다.', 'ok');
    },
    import: (ctx) => importJson(ctx, true),
    'import-replace': (ctx) => importJson(ctx, false),
    seed: async (ctx) => {
      if (await confirmDialog('데모 데이터를 현재 데이터에 병합할까요?', { okLabel: '넣기' })) {
        await withToast(ctx.repo.import(seedData(), { merge: true }), '데모 데이터를 넣었습니다.');
        ctx.ensureSelection();
      }
    },
    reset: async (ctx) => {
      if (await confirmDialog('모든 데이터를 삭제합니다. 되돌릴 수 없습니다.',
        { title: '전체 초기화', okLabel: '초기화', danger: true })) {
        await withToast(ctx.repo.reset(), '초기화했습니다.');
        saveSettings({ projectId: '', seeded: true });
        ctx.ensureSelection();
      }
    },
  },

  changes: {
    'adapter-kind': (_ctx, el) => {
      const showGas = el.value === 'gas';
      el.closest('form').querySelectorAll('.gas-only').forEach((label) => { label.hidden = !showGas; });
    },
    'sync-seconds': (_ctx, el) => {
      saveSettings({ syncSeconds: Number(el.value) || 0 });
      toast('자동 동기화 주기를 저장했습니다.', 'ok');
    },
  },

  submits: {
    adapter: async (ctx, values) => {
      await ctx.switchAdapter(values);
    },
    github: (ctx, values) => {
      saveSettings({ githubRepo: values.githubRepo.trim(), githubToken: values.githubToken.trim() });
      toast('GitHub 설정을 저장했습니다.', 'ok');
    },
  },
};

function renderUsers({ users }) {
  const root = document.querySelector('#user-admin');
  if (!root) return;
  root.innerHTML = users.length ? `<div class="table-wrap"><table><thead><tr><th>아이디</th><th>이름</th><th>이메일</th><th>권한</th><th>상태</th><th></th></tr></thead><tbody>${users.map((u) => `
    <tr><td class="mono">${escapeText(u.id)}</td><td>${escapeText(u.name)}</td><td>${escapeText(u.email)}</td><td>${escapeText(u.role)}</td><td>${escapeText(u.status)}</td><td>${u.role === 'admin' ? '' : `<button class="btn btn-sm btn-primary" data-act="approve-user" data-id="${escapeText(u.id)}">승인</button> <button class="btn btn-sm" data-act="reject-user" data-id="${escapeText(u.id)}">거절</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">가입 계정이 없습니다.</p>';
}
function escapeText(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

async function importJson(ctx, merge) {
  const file = await pickFile('application/json,.json');
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    await ctx.repo.import(payload, { merge });
    ctx.ensureSelection();
    toast(merge ? '데이터를 병합했습니다.' : '데이터를 덮어썼습니다.', 'ok');
  } catch (e) {
    toastError(e);
  }
}
