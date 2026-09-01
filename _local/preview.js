/**
 * 화면 미리보기 하네스 (로컬 전용).
 *
 * 앱 코드는 읽기만 하고 수정하지 않는다. 데이터 조작은 앱과 동일한 도메인 계층
 * (Repo + LocalAdapter)을 그대로 사용하므로, 미리보기에서 만든 상태는 앱에서 본 것과 동일하다.
 * Apps Script·GitHub 연동은 전혀 사용하지 않는다(브라우저 localStorage만 사용).
 */
import { Repo } from '../js/domain/repo.js';
import { LocalAdapter } from '../js/adapters/local.js';
import { seedData } from '../js/domain/seed.js';
import { toast } from '../js/core/ui.js';

/** 미리보기 대상 화면. 앱 라우트와 1:1로 대응한다(tests/routes.test.js가 동기화를 검증). */
export const ROUTES = [
  { label: '대시보드', hash: '#/dashboard', pattern: '/dashboard' },
  { label: '보드 (칸반)', hash: '#/board', pattern: '/board' },
  { label: '태스크 목록', hash: '#/tasks', pattern: '/tasks' },
  { label: '태스크 상세', hash: '#/tasks/GAME-142', pattern: '/tasks/:id' },
  { label: '에셋 목록', hash: '#/assets', pattern: '/assets' },
  { label: '에셋 상세 (체크아웃 중)', hash: '#/assets/ast-knight-blend', pattern: '/assets/:id' },
  { label: 'Git 연동', hash: '#/git', pattern: '/git' },
  { label: '변경 피드', hash: '#/feed', pattern: '/feed' },
  { label: '설정', hash: '#/settings', pattern: '/settings' },
  { label: '피드 · Git 필터', hash: '#/feed?source=git', pattern: '/feed' },
  { label: '태스크 · 진행 중 필터', hash: '#/tasks?status=IN_PROGRESS', pattern: '/tasks' },
];

const VIEWPORTS = [
  { id: 'desktop', label: '데스크톱 1440×900', w: 1440, h: 900 },
  { id: 'laptop', label: '노트북 1280×800', w: 1280, h: 800 },
  { id: 'tablet', label: '태블릿 834×1112', w: 834, h: 1112 },
  { id: 'mobile', label: '모바일 390×844', w: 390, h: 844 },
];

const $ = (sel) => document.querySelector(sel);
const canvas = $('#canvas');
const state = {
  route: ROUTES[0],
  viewport: VIEWPORTS[0],
  mode: 'single',
};

// ---------------------------------------------------------------- 렌더링
function renderRail() {
  $('#routes').innerHTML = ROUTES.map((r, i) => `
    <button data-route="${i}" class="${r === state.route ? 'active' : ''}">
      ${r.label}<small>${r.hash}</small>
    </button>`).join('');
}

function renderViewportPicker() {
  $('#viewport').innerHTML = VIEWPORTS
    .map((v) => `<option value="${v.id}"${v.id === state.viewport.id ? ' selected' : ''}>${v.label}</option>`)
    .join('');
}

const frame = (route, { w, h }, scale = 1) => `
  <div class="frame-wrap" style="width:${w}px;max-width:100%">
    <header><span>${route.label}</span><span>${route.hash}</span></header>
    <iframe src="../index.html${route.hash}" title="${route.label}"
            style="height:${h}px;width:${w}px;transform-origin:top left;${scale !== 1 ? `transform:scale(${scale});height:${h / scale}px;width:${w / scale}px` : ''}"
            loading="lazy"></iframe>
  </div>`;

function renderCanvas() {
  const vp = state.viewport;
  if (state.mode === 'gallery') {
    canvas.innerHTML = `<div class="gallery">${ROUTES.map((r) => frame(r, { w: vp.w, h: vp.h }, 0.5)).join('')}</div>`;
  } else {
    canvas.innerHTML = frame(state.route, vp);
  }
  $('#status').textContent = `${state.mode === 'gallery' ? `${ROUTES.length}개 화면` : state.route.label} · ${vp.w}×${vp.h}`;
}

function rerender() {
  renderRail();
  renderCanvas();
}

// ---------------------------------------------------------------- 데이터 도구
async function withRepo(fn, okMessage) {
  const repo = new Repo(new LocalAdapter({ namespace: 'gdh' }));
  await repo.load();
  await fn(repo);
  toast(okMessage, 'ok');
  renderCanvas();
}

const TOOLS = {
  seed: () => withRepo(async (repo) => {
    await repo.reset();
    await repo.import(seedData(), { merge: false });
  }, '데모 데이터를 다시 넣었습니다.'),

  empty: () => withRepo(async (repo) => {
    await repo.reset();
  }, '데이터를 비웠습니다.'),

  /** 목록·보드 성능과 레이아웃 붕괴를 확인하기 위한 대량 데이터. */
  bulk: () => withRepo(async (repo) => {
    await repo.reset();
    await repo.import(seedData(), { merge: false });
    const statuses = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const members = repo.members;
    const dump = repo.export();
    const now = Date.now();
    for (let i = 0; i < 200; i++) {
      dump.data.tasks.push({
        id: `GAME-${200 + i}`,
        project_id: 'prj-game',
        feature_id: '',
        title: `자동 생성 태스크 ${i + 1} · 레이아웃 확인용 긴 제목 샘플`,
        description: '대량 데이터 렌더링 확인용 항목입니다.',
        status: statuses[i % statuses.length],
        priority: priorities[i % priorities.length],
        assignee_id: members[i % members.length]?.id || '',
        git_branch: `feature/auto-${i}`,
        git_pr: '',
        created_at: new Date(now - i * 3600000).toISOString(),
        updated_at: new Date(now - i * 1800000).toISOString(),
      });
    }
    await repo.import(dump, { merge: false });
  }, 'Task 200건을 추가했습니다.'),

  wipe: async () => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('gdh')) localStorage.removeItem(key);
    }
    toast('로컬 저장소를 비웠습니다. 앱을 다시 열면 데모 데이터가 재생성됩니다.', 'ok');
    renderCanvas();
  },
};

// ---------------------------------------------------------------- 이벤트
document.addEventListener('click', (e) => {
  const routeBtn = e.target.closest('[data-route]');
  if (routeBtn) {
    state.route = ROUTES[Number(routeBtn.dataset.route)];
    state.mode = 'single';
    $('#mode').value = 'single';
    return rerender();
  }
  const toolBtn = e.target.closest('[data-tool]');
  if (toolBtn) {
    Promise.resolve(TOOLS[toolBtn.dataset.tool]()).catch((err) => toast(err.message, 'err'));
  }
});

$('#mode').addEventListener('change', (e) => { state.mode = e.target.value; renderCanvas(); });
$('#viewport').addEventListener('change', (e) => {
  state.viewport = VIEWPORTS.find((v) => v.id === e.target.value) || VIEWPORTS[0];
  renderCanvas();
});
$('#reload').addEventListener('click', () => renderCanvas());

renderViewportPicker();
rerender();
