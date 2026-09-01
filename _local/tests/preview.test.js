// 로컬 미리보기 하네스 자체 테스트 (jsdom)
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../preview.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8080/_local/preview.html', pretendToBeVisual: true });
const { window } = dom;
for (const key of ['window', 'document', 'localStorage', 'EventTarget', 'CustomEvent', 'Event',
  'MouseEvent', 'HTMLElement', 'Element', 'Node', 'CSS', 'FileReader', 'Blob', 'URL']) {
  if (window[key] !== undefined) globalThis[key] = window[key];
}
globalThis.navigator = window.navigator;

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? (pass++, console.log('  ✓', label)) : (fail++, console.log('  ✗', label)); };

const { ROUTES } = await import('../preview.js');
await tick();

const doc = window.document;
const frames = () => [...doc.querySelectorAll('#canvas iframe')];

console.log('\n[1] 초기 렌더');
ok(doc.querySelectorAll('#routes button').length === ROUTES.length, `라우트 버튼 ${ROUTES.length}개`);
ok(frames().length === 1, '단일 모드에서 iframe 1개');
ok(frames()[0].getAttribute('src') === '../index.html#/dashboard', `앱을 상대경로로 로드 (${frames()[0].getAttribute('src')})`);
ok(doc.querySelector('#viewport').options.length === 4, '뷰포트 프리셋 4종');

console.log('\n[2] 화면 전환');
doc.querySelectorAll('#routes button')[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick();
ok(frames()[0].getAttribute('src').includes('#/tasks/GAME-142'), '태스크 상세로 전환');
ok(doc.querySelector('#routes button.active').textContent.includes('태스크 상세'), '활성 표시 갱신');

console.log('\n[3] 전체 보기 · 뷰포트');
const mode = doc.querySelector('#mode');
mode.value = 'gallery';
mode.dispatchEvent(new window.Event('change', { bubbles: true }));
await tick();
ok(frames().length === ROUTES.length, `갤러리 모드에서 ${ROUTES.length}개 동시 렌더`);
mode.value = 'single';
mode.dispatchEvent(new window.Event('change', { bubbles: true }));
const vp = doc.querySelector('#viewport');
vp.value = 'mobile';
vp.dispatchEvent(new window.Event('change', { bubbles: true }));
await tick();
ok(frames()[0].style.width === '390px', `모바일 폭 적용 (${frames()[0].style.width})`);

console.log('\n[4] 데이터 도구 (localStorage 전용)');
doc.querySelector('[data-tool="seed"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(120);
ok(JSON.parse(window.localStorage.getItem('gdh:projects') || '[]').length === 2, '데모 데이터 주입');
doc.querySelector('[data-tool="bulk"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(300);
ok(JSON.parse(window.localStorage.getItem('gdh:tasks') || '[]').length === 206, '대용량 샘플 Task 206건');
doc.querySelector('[data-tool="empty"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(120);
ok(JSON.parse(window.localStorage.getItem('gdh:tasks') || '[]').length === 0, '빈 상태 전환');
doc.querySelector('[data-tool="wipe"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(80);
ok(!Object.keys(window.localStorage).some((k) => k.startsWith('gdh')), '저장소 완전 삭제');

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
