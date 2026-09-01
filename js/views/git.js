import { html } from '../core/dom.js';
import { relTime } from '../core/util.js';
import { GitHubClient, extractTaskKeys } from '../adapters/github.js';
import { chip, taskLink, empty, pageHead } from './components.js';
import { linkGitDialog } from './dialogs.js';
import { toast, toastError, withToast, confirmDialog } from '../core/ui.js';
import { settings } from '../core/store.js';

/**
 * GitHub 연동 화면.
 * 정적 호스팅에서는 Webhook 대신 REST 폴링으로 Commit/PR을 가져와
 * 커밋 메시지·브랜치명의 Task 키(GAME-142)로 자동 매핑한다.
 */
const state = { events: [], kind: '', loading: false };

export default {
  title: 'Git 연동',

  render(ctx) {
    const { repo, projectId } = ctx;
    const project = repo.project(projectId);
    if (!project) return html`${pageHead('Git 연동')}${empty('프로젝트를 먼저 선택하세요.')}`;

    const repoName = project.repository || settings.githubRepo;
    const links = repo.gitLinks(projectId);
    const keys = [project.key];

    return html`
      ${pageHead('Git 연동', html`<button class="btn" data-act="manual">수동 연결</button>`)}

      <div class="card">
        <div class="between">
          <div>
            <h3 style="margin-bottom:4px">저장소</h3>
            <p class="muted" style="margin:0">
              ${repoName ? html`<span class="mono">${repoName}</span>` : '저장소가 설정되지 않았습니다.'}
              · Task 키 <span class="mono">${project.key}-###</span> 패턴으로 자동 매핑합니다.
            </p>
          </div>
          <div class="row">
            <button class="btn" data-act="fetch-commits" ${state.loading ? 'disabled' : ''}>커밋 가져오기</button>
            <button class="btn" data-act="fetch-pulls" ${state.loading ? 'disabled' : ''}>PR 가져오기</button>
          </div>
        </div>
        ${repoName ? '' : html`
          <p class="muted" style="margin-top:10px">
            설정 화면 또는 프로젝트 편집에서 <span class="mono">owner/repo</span> 를 입력하세요.
          </p>`}
      </div>

      ${state.loading ? html`<div class="skeleton" style="margin-top:16px"></div>` : ''}

      ${state.events.length ? html`
        <div class="section-head">
          <h2>가져온 ${state.kind} (${state.events.length})</h2>
          <div class="row">
            <button class="btn btn-primary" data-act="import">Task에 연결</button>
            <button class="btn btn-ghost" data-act="clear">지우기</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>식별자</th><th>메시지</th><th>브랜치</th><th>작성자</th><th>매핑</th><th>시각</th></tr></thead>
            <tbody>
              ${state.events.map((ev) => {
                const matched = extractTaskKeys(`${ev.message || ev.title || ''} ${ev.branch || ''}`, keys)
                  .filter((id) => repo.task(id));
                return html`
                  <tr>
                    <td class="mono">${ev.type === 'pull_request' ? `#${ev.number}` : ev.shortSha}</td>
                    <td>${ev.url ? html`<a href="${ev.url}" target="_blank" rel="noopener">${ev.message || ev.title}</a>` : (ev.message || ev.title)}</td>
                    <td class="mono" style="font-size:12px">${ev.branch || '-'}</td>
                    <td>${ev.author}</td>
                    <td>${matched.length ? matched.map((id) => taskLink(id)) : chip('미매핑', 'gray')}</td>
                    <td class="muted" style="font-size:12.5px">${relTime(ev.date)}</td>
                  </tr>`;
              })}
            </tbody>
          </table>
        </div>` : ''}

      <div class="section-head"><h2>연결된 Git 링크 (${links.length})</h2></div>
      ${links.length ? html`
        <div class="table-wrap">
          <table>
            <thead><tr><th>유형</th><th>Task</th><th>내용</th><th>브랜치</th><th>작성자</th><th>시각</th><th></th></tr></thead>
            <tbody>
              ${links.map((g) => html`
                <tr>
                  <td>${chip(g.event_type === 'GIT_PR' ? 'PR' : 'Commit', 'purple')}</td>
                  <td>${g.task_id ? taskLink(g.task_id) : '-'}</td>
                  <td>
                    <span class="mono" style="font-size:12px">${g.commit_sha ? g.commit_sha.slice(0, 7) : (g.pull_request_no ? `#${g.pull_request_no}` : '')}</span>
                    ${g.url ? html`<a href="${g.url}" target="_blank" rel="noopener">${g.message}</a>` : html`<span>${g.message}</span>`}
                  </td>
                  <td class="mono" style="font-size:12px">${g.branch || '-'}</td>
                  <td>${g.author || '-'}</td>
                  <td class="muted" style="font-size:12.5px">${relTime(g.created_at)}</td>
                  <td><button class="btn btn-sm btn-ghost" data-act="unlink" data-id="${g.id}">✕</button></td>
                </tr>`)}
            </tbody>
          </table>
        </div>`
        : empty('아직 연결된 Commit/PR이 없습니다.')}`;
  },

  actions: {
    manual: (ctx) => linkGitDialog(ctx),
    'fetch-commits': (ctx) => fetchEvents(ctx, 'commits'),
    'fetch-pulls': (ctx) => fetchEvents(ctx, 'pulls'),
    clear: (ctx) => { state.events = []; ctx.rerender(); },
    import: async (ctx) => {
      const project = ctx.repo.project(ctx.projectId);
      const repository = project.repository || settings.githubRepo;
      const result = await withToast(
        ctx.repo.importGitEvents(ctx.projectId, state.events, { repository, actorId: ctx.actorId }), null);
      if (!result) return;
      toast(`연결 ${result.linked}건 · 중복 ${result.skipped}건 · 미매핑 ${result.unmatched}건`,
        result.linked ? 'ok' : 'info', 4200);
      if (result.linked) { state.events = []; }
      ctx.rerender();
    },
    unlink: async (ctx, el) => {
      if (await confirmDialog('이 Git 링크를 삭제할까요?', { okLabel: '삭제', danger: true })) {
        await ctx.repo.removeGitLink(el.dataset.id);
      }
    },
  },
};

async function fetchEvents(ctx, kind) {
  const project = ctx.repo.project(ctx.projectId);
  const repoName = project.repository || settings.githubRepo;
  if (!repoName) return toast('GitHub 저장소를 먼저 설정하세요(owner/repo).', 'err');

  const client = new GitHubClient({ repo: repoName, token: settings.githubToken });
  state.loading = true;
  ctx.rerender();
  try {
    state.events = kind === 'pulls' ? await client.listPulls() : await client.listCommits();
    state.kind = kind === 'pulls' ? 'Pull Request' : 'Commit';
    if (!state.events.length) toast('가져올 항목이 없습니다.', 'info');
  } catch (e) {
    state.events = [];
    toastError(e);
  } finally {
    state.loading = false;
    ctx.rerender();
  }
}
