// 브라우저 부트스트랩 통합 테스트 (jsdom)
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://example.github.io/gamedev-hub/#/dashboard', pretendToBeVisual: true });
const { window } = dom;

for (const key of ['window', 'document', 'localStorage', 'EventTarget', 'CustomEvent', 'Event',
  'MouseEvent', 'HTMLElement', 'Element', 'Node', 'CSS', 'DataTransfer', 'FileReader', 'Blob',
  'URL', 'getComputedStyle']) {
  if (window[key] !== undefined) globalThis[key] = window[key];
}
globalThis.navigator = window.navigator;

// 승인된 로그인 세션을 복원하되, 앱 데이터는 로컬 어댑터로 검증한다.
window.localStorage.setItem('gdh:settings', JSON.stringify({
  adapter: 'local', gasEndpoint: 'https://example.test/exec', authSession: 'test-session',
}));
globalThis.fetch = async () => ({ text: async () => JSON.stringify({
  user: { id: 'tester', name: '테스터', email: 'tester@example.com', role: 'admin', status: 'approved' },
}) });

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? (pass++, console.log('  ✓', label)) : (fail++, console.log('  ✗', label)); };

await import('../../js/main.js');
await tick(120);

const view = window.document.getElementById('view');
const text = () => view.textContent.replace(/\s+/g, ' ');

console.log('\n[1] 초기 부팅');
ok(text().includes('Project Valkyrie'), '데모 프로젝트 자동 시드 및 대시보드 렌더');
ok(window.document.getElementById('project-picker').options.length === 2, '프로젝트 선택기 채움');
ok(window.document.getElementById('storage-chip').textContent.includes('브라우저'), '어댑터 칩 표시');
ok(window.document.title.includes('대시보드'), '문서 제목 갱신');

console.log('\n[2] 라우팅');
for (const [hash, expect] of [
  ['#/board', '보드'], ['#/tasks', '태스크'], ['#/assets', '에셋'],
  ['#/git', 'Git 연동'], ['#/feed', '변경 피드'], ['#/settings', '설정'],
  ['#/tasks/GAME-142', '기사 캐릭터 구현'], ['#/assets/ast-knight-fbx', 'knight.fbx'],
]) {
  window.location.hash = hash;
  await tick(40);
  ok(text().includes(expect), `${hash} → "${expect}"`);
}
ok(window.document.querySelector('#nav a.active') !== null, '사이드바 활성 표시');

console.log('\n[3] 상호작용 — 보드 상태 변경 후 카드 이동');
window.location.hash = '#/tasks';
await tick(40);
const select = view.querySelector('select[data-change="status-of"][data-id="GAME-144"]');
select.value = 'DONE';
select.dispatchEvent(new window.Event('change', { bubbles: true }));
await tick(60);
window.location.hash = '#/board';
await tick(50);
const doneCol = view.querySelector('.col[data-col="DONE"]');
ok(doneCol.textContent.includes('GAME-144'), '표에서 바꾼 상태가 보드에 반영');

console.log('\n[4] 모달 — 새 Task 생성');
view.querySelector('[data-act="new-task"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(40);
const modal = window.document.getElementById('modal-root');
ok(!modal.hidden && modal.querySelector('form'), '새 Task 모달 오픈');
modal.querySelector('input[name="title"]').value = '자동화 테스트 Task';
modal.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick(80);
ok(modal.hidden, '제출 후 모달 닫힘');
ok(view.textContent.includes('자동화 테스트 Task'), '생성된 Task가 보드에 표시');

console.log('\n[5] 에셋 체크아웃 → 체크인');
window.location.hash = '#/assets';
await tick(50);
const checkoutBtn = view.querySelector('[data-act="checkout"][data-id="ast-knight-fbx"]');
checkoutBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(60);
const row = [...view.querySelectorAll('tr')].find((tr) => tr.textContent.includes('knight.fbx'));
ok(row.textContent.includes('체크아웃'), '체크아웃 후 락 상태 표시');
const checkinBtn = view.querySelector('[data-act="checkin"][data-id="ast-knight-fbx"]');
ok(!!checkinBtn, '락 소유자에게 체크인 버튼 노출');
checkinBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(40);
modal.querySelector('input[name="comment"]').value = '테스트 체크인';
modal.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick(120);
const row2 = [...view.querySelectorAll('tr')].find((tr) => tr.textContent.includes('knight.fbx'));
ok(row2.textContent.includes('v13'), '체크인 후 버전 증가(v12 → v13)');

console.log('\n[6] 검색 · 쿼리 필터');
const search = window.document.getElementById('global-search');
search.value = 'knight_spec';
search.dispatchEvent(new window.Event('input', { bubbles: true }));
await tick(260);
ok(!view.textContent.includes('knight.blend') && view.textContent.includes('knight_spec'), '전역 검색 필터');
search.value = '';
search.dispatchEvent(new window.Event('input', { bubbles: true }));
await tick(260);

window.location.hash = '#/feed';
await tick(50);
view.querySelector('[data-act="toggle-source"][data-id="git"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(60);
ok(window.location.hash.includes('source=git'), '피드 필터가 URL 쿼리에 반영');
ok(view.textContent.includes('Commit 연결') || view.textContent.includes('PR 연결'), 'Git 소스만 표시');

console.log('\n[7] 새로고침 후 상태 유지');
ok(JSON.parse(window.localStorage.getItem('gdh:tasks')).some((t) => t.title === '자동화 테스트 Task'),
  'localStorage에 영속화');

console.log('\n[8] 팀 동기화');
const syncBtn = window.document.getElementById('sync-btn');
const syncStatus = window.document.getElementById('sync-status');
ok(!!syncBtn && !!syncStatus && syncStatus.textContent.startsWith('마지막 동기화'),
  `상단바 동기화 UI 표시: "${syncStatus?.textContent}"`);

// 다른 탭 역할: 앱과 같은 namespace에 별도 어댑터로 Task를 밀어 넣는다.
const { LocalAdapter } = await import('../../js/adapters/local.js');
const otherTab = new LocalAdapter({ namespace: 'gdh' });
const stamp = new Date().toISOString();
await otherTab.insert('tasks', {
  id: 'GAME-901', project_id: 'prj-game', feature_id: '', title: '다른 팀원이 만든 Task',
  description: '', status: 'TODO', priority: 'MEDIUM', assignee_id: '',
  git_branch: '', git_pr: '', created_at: stamp, updated_at: stamp,
});
window.location.hash = '#/tasks';
await tick(50);
syncBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(150);
ok(text().includes('다른 팀원이 만든 Task'), '다시 불러오기 버튼이 다른 탭의 변경을 가져온다');

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
