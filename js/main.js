import { $, on, render, html, formData, esc } from './core/dom.js';
import { debounce, relTime, fmtDate } from './core/util.js';
import { settings, saveSettings } from './core/store.js';
import { DEFAULT_GAS_ENDPOINT } from './config.js';
import { restoreSession, login, register, bootstrapAdmin, logout } from './core/auth.js';
import { Router } from './core/router.js';
import { toast, toastError } from './core/ui.js';
import { createAdapter, LocalAdapter } from './adapters/index.js';
import { Repo } from './domain/repo.js';
import { seedData } from './domain/seed.js';

import dashboard from './views/dashboard.js';
import board from './views/board.js';
import tasks from './views/tasks.js';
import taskDetail from './views/task-detail.js';
import assets from './views/assets.js';
import assetDetail from './views/asset-detail.js';
import git from './views/git.js';
import feed from './views/feed.js';
import settingsView from './views/settings.js';

const VIEWS = {
  '/dashboard': dashboard,
  '/board': board,
  '/tasks': tasks,
  '/tasks/:id': taskDetail,
  '/assets': assets,
  '/assets/:id': assetDetail,
  '/git': git,
  '/feed': feed,
  '/settings': settingsView,
};

const SYNC_TICK_MS = 15000;   // 자동 동기화 조건 검사 주기(동기화 주기 자체가 아니다)

const viewRoot = $('#view');
let repo;
let current = { view: dashboard, params: {}, query: {}, path: '/dashboard' };
let searchTerm = '';
let rendering = false;
let syncing = false;          // 중복 클릭/중복 tick 방지
let syncFails = 0;            // 연속 자동 동기화 실패 횟수
let autoPaused = false;       // 3연속 실패 시 자동 동기화 중지

/** 뷰에 전달되는 실행 컨텍스트. 상태 접근과 명령을 한곳에 모은다. */
const ctx = {
  get repo() { return repo; },
  get params() { return current.params; },
  get query() { return current.query; },
  get search() { return searchTerm; },
  get projectId() { return settings.projectId; },
  get actorId() { return settings.actorId; },
  go: (path) => Router.go(path),
  rerender: () => renderView(),
  setQuery,
  setProject,
  ensureSelection,
  switchAdapter,
  sync: () => syncNow({ manual: true }),
};

const onRepoChange = () => renderView();

// ------------------------------------------------------------------ 부트스트랩
boot().catch((e) => {
  toastError(e);
  render(viewRoot, html`<div class="empty"><p>초기화에 실패했습니다: ${e.message}</p></div>`);
});

async function boot() {
  bindAuth();
  const user = await restoreSession();
  if (!user) { showAuth('login'); return; }
  await bootApp();
}

async function bootApp() {
  $('#auth-shell').innerHTML = '';
  $('#app').hidden = false;
  repo = new Repo(createAdapter(settings));
  try {
    await repo.load();
  } catch (e) {
    await logout();
    $('#app').hidden = true;
    showAuth('login', e.message);
    return;
  }

  await seedIfEmpty();
  ensureSelection();

  repo.addEventListener('change', onRepoChange);
  bindChrome();

  new Router(
    Object.fromEntries(Object.entries(VIEWS).map(([pattern, view]) => [
      pattern,
      ({ params, query, path }) => { current = { view, params, query, path }; renderView(); },
    ])),
  ).start();
}

function bindAuth() {
  const root = $('#auth-shell');
  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-auth-tab]');
    if (tab) showAuth(tab.dataset.authTab);
  });
  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const values = formData(form);
    if (values.endpoint) saveSettings({ gasEndpoint: values.endpoint.trim() });
    setAuthMessage('처리 중…');
    try {
      if (form.dataset.auth === 'login') { await login(values.id.trim(), values.password); await bootApp(); }
      if (form.dataset.auth === 'register') {
        await register({ id: values.id.trim(), password: values.password, name: values.name.trim(), email: values.email.trim() });
        showAuth('login', '회원가입이 완료되었습니다. 관리자의 승인을 기다려주세요.', 'ok');
      }
      if (form.dataset.auth === 'bootstrap') {
        await bootstrapAdmin({ setupKey: values.setupKey, id: values.id.trim(), password: values.password, name: values.name.trim(), email: values.email.trim() });
        showAuth('login', '관리자 계정이 생성되었습니다. 로그인하세요.', 'ok');
      }
    } catch (err) { setAuthMessage(err.message, 'err'); }
  });
}

function showAuth(mode = 'login', message = '', tone = '') {
  $('#app').hidden = true;
  const endpoint = settings.gasEndpoint || '';
  // 배포본에 URL이 박혀 있으면(config.js) 매번 붙여넣지 않는다. 없을 때만 입력칸을 보여준다.
  const common = DEFAULT_GAS_ENDPOINT
    ? ''
    : html`<label class="field"><span>Apps Script URL</span><input name="endpoint" type="url" required value="${endpoint}" placeholder="https://script.google.com/macros/s/.../exec"></label>`;
  const account = html`<label class="field"><span>아이디</span><input name="id" required minlength="4" maxlength="32" autocomplete="username"></label>
    <label class="field"><span>패스워드</span><input name="password" type="password" required minlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>`;
  const profile = html`<label class="field"><span>이름</span><input name="name" required maxlength="50"></label><label class="field"><span>이메일</span><input name="email" type="email" required maxlength="120"></label>`;
  const extra = mode === 'register' ? profile : mode === 'bootstrap' ? html`${profile}<label class="field"><span>관리자 설정 키</span><input name="setupKey" type="password" required><small>Code.gs의 SHARED_TOKEN 값</small></label>` : '';
  render($('#auth-shell'), html`<div class="auth-card"><h1>GameDev Hub</h1><p class="muted">승인된 팀원만 접속할 수 있습니다.</p>
    <div class="auth-tabs"><button class="btn ${mode === 'login' ? 'btn-primary' : ''}" data-auth-tab="login">로그인</button><button class="btn ${mode === 'register' ? 'btn-primary' : ''}" data-auth-tab="register">회원가입</button><button class="btn ${mode === 'bootstrap' ? 'btn-primary' : ''}" data-auth-tab="bootstrap">최초 관리자</button></div>
    <form class="stack" data-auth="${mode}">${common}${account}${extra}<button class="btn btn-primary" type="submit">${mode === 'login' ? '로그인' : mode === 'register' ? '가입 신청' : '관리자 생성'}</button></form>
    <div id="auth-message" class="auth-message" data-tone="${tone}">${message}</div></div>`);
}

function setAuthMessage(message, tone = '') { const el = $('#auth-message'); if (el) { el.textContent = message; el.dataset.tone = tone; } }

async function seedIfEmpty() {
  if (settings.seeded || repo.projects.length) return;
  try {
    await repo.import(seedData(), { merge: true });
    toast('데모 데이터를 불러왔습니다. 설정에서 초기화할 수 있습니다.', 'info', 4200);
  } catch (e) {
    console.warn('[boot] 시드 실패', e);
  }
  saveSettings({ seeded: true });
}

/** 선택된 프로젝트/사용자가 유효하지 않으면 첫 번째 항목으로 보정한다. */
function ensureSelection() {
  const patch = {};
  if (!repo.project(settings.projectId)) patch.projectId = repo.projects[0]?.id || '';
  if (!repo.member(settings.actorId)) patch.actorId = repo.members[0]?.id || '';
  if (Object.keys(patch).length) saveSettings(patch);
  renderChrome();
}

// ------------------------------------------------------------------ 렌더링
function renderView() {
  if (rendering) return;
  rendering = true;
  try {
    renderChrome();
    render(viewRoot, current.view.render(ctx));
    current.view.mount?.(ctx, viewRoot);
    document.title = `${current.view.title} · GameDev Hub`;
  } catch (e) {
    toastError(e);
    render(viewRoot, html`<div class="empty"><p>화면을 그리는 중 오류가 발생했습니다: ${e.message}</p></div>`);
  } finally {
    rendering = false;
  }
}

/** 사이드바/상단바 등 뷰 밖 UI. */
function renderChrome() {
  const projectSelect = $('#project-picker');
  const project = repo.project(settings.projectId);
  projectSelect.innerHTML = repo.projects.length
    ? repo.projects.map((p) => `<option value="${p.id}"${p.id === settings.projectId ? ' selected' : ''}>${p.key} · ${esc(p.name)}</option>`).join('')
    : '<option value="">프로젝트 없음</option>';

  const actorSelect = $('#actor-picker');
  actorSelect.innerHTML = repo.members.length
    ? repo.members.map((m) => `<option value="${m.id}"${m.id === settings.actorId ? ' selected' : ''}>${esc(m.name)}</option>`).join('')
    : '<option value="">사용자 없음</option>';

  $('#storage-chip').textContent = repo.adapter.label;
  $('#crumbs').textContent = [project ? `${project.key} · ${project.name}` : '프로젝트 없음', current.view.title].join('  ›  ');

  const btn = $('#sync-btn');
  const status = $('#sync-status');
  btn.disabled = syncing;
  btn.textContent = syncing ? '불러오는 중…' : '다시 불러오기';
  if (syncing)                 { status.textContent = '동기화 중…';         status.dataset.tone = ''; }
  else if (autoPaused)         { status.textContent = '자동 동기화 중지됨';  status.dataset.tone = 'err'; }
  else if (repo.lastSyncError) { status.textContent = '동기화 실패';         status.dataset.tone = 'err'; }
  else if (repo.lastSyncedAt)  { status.textContent = `마지막 동기화 ${relTime(repo.lastSyncedAt)}`; status.dataset.tone = ''; }
  else                         { status.textContent = '동기화 전';           status.dataset.tone = ''; }
  status.title = repo.lastSyncError?.message || (repo.lastSyncedAt ? fmtDate(repo.lastSyncedAt) : '');
}

// ------------------------------------------------------------------ 동기화
/** 저장소에서 최신 스냅샷을 다시 읽는다. 수동(버튼)과 자동(주기) 경로가 여기로 수렴한다. */
async function syncNow({ manual }) {
  if (syncing || !repo) return;
  syncing = true;
  renderChrome();                       // 버튼을 "불러오는 중…"으로
  try {
    const r = await repo.reload({ silent: !manual });
    if (r.ok) {
      syncFails = 0;
      autoPaused = false;
      ensureSelection();                // 원격에서 프로젝트/멤버가 추가·삭제됐을 수 있다
      if (manual) {
        // 지문이 감지하지 못하는 변경(멤버 이름 등)도 있으므로 수동 경로는 항상 다시 그린다.
        renderView();
        toast(r.changed ? '최신 데이터를 불러왔습니다.' : '이미 최신 상태입니다.', r.changed ? 'ok' : 'info');
      }
      // 자동 경로는 repo가 changed일 때만 emit → renderView가 알아서 돌아간다.
    } else if (r.skipped) {
      if (manual) toast('변경 사항을 저장하는 중입니다. 잠시 후 다시 시도하세요.', 'info');
    } else {
      syncFails++;
      if (syncFails === 1) toast('자동 동기화에 실패했습니다. 상단바에서 다시 시도할 수 있습니다.', 'err');
      if (syncFails >= 3) {
        autoPaused = true;
        toast('자동 동기화를 중지했습니다. 연결을 확인한 뒤 다시 불러오기를 눌러주세요.', 'err', 5000);
      }
    }
  } catch (e) {
    syncFails++;
    toastError(e);                      // silent:false인 수동 경로만 여기로 온다
  } finally {
    syncing = false;
    renderChrome();
  }
}

/** 자동 동기화 조건. 하나라도 어긋나면 이번 tick은 건너뛴다(다음 tick에 다시 본다). */
function canAutoSync() {
  const seconds = Number(settings.syncSeconds) || 0;
  if (!seconds || autoPaused || syncing || !repo) return false;
  if (document.visibilityState !== 'visible') return false;             // 백그라운드 탭에서 호출량 낭비 금지
  if (!$('#modal-root').hidden) return false;                           // 모달 폼 값 유실 방지
  if (document.querySelector('.dragging')) return false;                // 보드 드래그 중 방지
  const ae = document.activeElement;
  if (ae && viewRoot.contains(ae) && ae.matches('input,select,textarea')) return false;  // 입력 중 방지
  if (repo.pending > 0) return false;
  const last = repo.lastSyncedAt ? new Date(repo.lastSyncedAt).getTime() : 0;
  return Date.now() - last >= seconds * 1000;
}


// ------------------------------------------------------------------ 이벤트 위임
function bindChrome() {
  // 뷰 액션: data-act 클릭, data-change 변경, data-submit 제출
  on(viewRoot, 'click', '[data-act]', (e, el) => {
    // 행 전체가 클릭 대상일 때 내부 컨트롤/링크 클릭은 무시한다.
    if (e.target.matches('select,input,textarea,a,option')) return;
    const fn = current.view.actions?.[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    Promise.resolve(fn(ctx, el, e)).catch(toastError);
  });

  on(viewRoot, 'change', '[data-change]', (e, el) => {
    const fn = current.view.changes?.[el.dataset.change];
    if (fn) Promise.resolve(fn(ctx, el, e)).catch(toastError);
  });

  on(viewRoot, 'submit', '[data-submit]', (e, el) => {
    e.preventDefault();
    const fn = current.view.submits?.[el.dataset.submit];
    if (fn) Promise.resolve(fn(ctx, formData(el), el)).catch(toastError);
  });

  // 파일 드롭: 뷰가 drops 맵에 선언한 영역(data-drop)에서만 받는다.
  const dropTarget = (el) => current.view.drops?.[el.dataset.drop];
  on(viewRoot, 'dragover', '[data-drop]', (e, el) => {
    if (!dropTarget(el)) return;
    e.preventDefault();                       // 이게 있어야 drop 이벤트가 발생한다
    el.classList.add('drag-over');
  });
  on(viewRoot, 'dragleave', '[data-drop]', (e, el) => {
    if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
  });
  on(viewRoot, 'drop', '[data-drop]', (e, el) => {
    const fn = dropTarget(el);
    if (!fn) return;
    e.preventDefault();
    el.classList.remove('drag-over');
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) Promise.resolve(fn(ctx, files, el)).catch(toastError);
  });
  // 드롭존 밖에 떨어뜨린 파일로 브라우저가 페이지를 떠나 작업이 날아가는 것을 막는다.
  // 보드 카드 드래그(파일이 아님)는 그대로 두어야 하므로 파일 드래그만 막는다.
  const isFileDrag = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (e) => { if (isFileDrag(e)) e.preventDefault(); });
  }

  $('#project-picker').addEventListener('change', (e) => setProject(e.target.value));
  $('#actor-picker').addEventListener('change', (e) => { saveSettings({ actorId: e.target.value }); renderView(); });

  const search = $('#global-search');
  search.addEventListener('input', debounce(() => { searchTerm = search.value.trim(); renderView(); }, 180));

  $('#sync-btn').addEventListener('click', () => syncNow({ manual: true }));
  $('#logout-btn').addEventListener('click', async () => {
    await logout();
    location.reload();
  });
  setInterval(() => { if (canAutoSync()) syncNow({ manual: false }); }, SYNC_TICK_MS);
  document.addEventListener('visibilitychange', () => { if (canAutoSync()) syncNow({ manual: false }); });
}

function setProject(projectId) {
  saveSettings({ projectId });
  renderView();
}

/** 현재 경로를 유지하며 쿼리스트링만 갱신한다(값이 null이면 제거). */
function setQuery(patch) {
  const params = new URLSearchParams(current.query);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  Router.go(`${current.path}${qs ? `?${qs}` : ''}`);
}

/** 설정 화면에서 저장소 어댑터를 교체한다. 실패 시 이전 어댑터를 유지한다. */
async function switchAdapter(values) {
  const previous = repo;
  const next = { ...settings, ...values };
  const candidate = new Repo(createAdapter(next));
  try {
    await candidate.load();
  } catch (e) {
    toastError(e);
    return false;
  }
  saveSettings(values);
  previous.removeEventListener('change', onRepoChange);
  syncFails = 0;
  autoPaused = false;
  repo = candidate;
  repo.addEventListener('change', onRepoChange);
  await seedIfEmpty();
  ensureSelection();
  toast(`저장소를 ${repo.adapter.label}(으)로 전환했습니다.`, 'ok');
  renderView();
  return true;
}
