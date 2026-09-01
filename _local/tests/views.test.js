// 뷰 렌더링 스모크 테스트: 각 화면이 예외 없이 HTML을 생성하는지 검증
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
if (typeof globalThis.CustomEvent !== 'function') {
  globalThis.CustomEvent = class extends Event { constructor(t, o = {}) { super(t, o); this.detail = o.detail; } };
}

const { Repo } = await import('../../js/domain/repo.js');
const { LocalAdapter } = await import('../../js/adapters/local.js');
const { seedData } = await import('../../js/domain/seed.js');
const { toHtml } = await import('../../js/core/dom.js');

const repo = new Repo(new LocalAdapter({ namespace: 'render' }));
await repo.load();
await repo.import(seedData(), { merge: false });

const views = {
  dashboard: ['../../js/views/dashboard.js', {}],
  board: ['../../js/views/board.js', {}],
  tasks: ['../../js/views/tasks.js', {}],
  'task-detail': ['../../js/views/task-detail.js', { id: 'GAME-142' }],
  assets: ['../../js/views/assets.js', {}],
  'asset-detail': ['../../js/views/asset-detail.js', { id: 'ast-knight-blend' }],
  git: ['../../js/views/git.js', {}],
  feed: ['../../js/views/feed.js', {}],
  settings: ['../../js/views/settings.js', {}],
};

let pass = 0, fail = 0;
for (const [name, [path, params]] of Object.entries(views)) {
  const view = (await import(path)).default;
  const ctx = {
    repo, params, query: {}, search: '', projectId: 'prj-game', actorId: 'usr-kim',
    go() {}, rerender() {}, setQuery() {}, setProject() {}, ensureSelection() {}, switchAdapter() {},
  };
  try {
    const out = toHtml(view.render(ctx));
    const problems = [];
    if (!out || out.length < 100) problems.push('출력이 비어 있음');
    if (out.includes('undefined')) problems.push('undefined 노출');
    if (out.includes('[object Object]')) problems.push('[object Object] 노출');
    if (/\[object Object\]|,\s*,/.test(out)) problems.push('배열 직렬화 오류 의심');
    if (problems.length) { fail++; console.log(`  ✗ ${name}: ${problems.join(', ')}`); }
    else { pass++; console.log(`  ✓ ${name} (${out.length}자)`); }
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

// 빈 프로젝트 상태에서도 안전한지
for (const [name, [path]] of Object.entries(views)) {
  const view = (await import(path)).default;
  const empty = new Repo(new LocalAdapter({ namespace: 'empty' }));
  await empty.load();
  const ctx = { repo: empty, params: {}, query: {}, search: '', projectId: '', actorId: '', go() {}, rerender() {}, setQuery() {}, ensureSelection() {} };
  try { toHtml(view.render(ctx)); pass++; }
  catch (e) { fail++; console.log(`  ✗ ${name} (빈 상태): ${e.message}`); }
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
