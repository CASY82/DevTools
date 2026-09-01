// 도메인 계층 스모크 테스트 (node에서 브라우저 API를 최소 스텁으로 대체)
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

if (typeof globalThis.CustomEvent !== 'function') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, opts = {}) { super(type, opts); this.detail = opts.detail; }
  };
}

const { Repo } = await import('../../js/domain/repo.js');
const { LocalAdapter } = await import('../../js/adapters/local.js');
const { seedData } = await import('../../js/domain/seed.js');
const { ConflictError } = await import('../../js/adapters/base.js');

let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? (pass++, console.log('  ✓', label)) : (fail++, console.log('  ✗', label)); };
const eq = (a, b, label) => ok(a === b, `${label} (${JSON.stringify(a)} === ${JSON.stringify(b)})`);

const repo = new Repo(new LocalAdapter({ namespace: 'test' }));
await repo.load();

console.log('\n[1] 시드 적재');
await repo.import(seedData(), { merge: true });
eq(repo.projects.length, 2, '프로젝트 2개');
eq(repo.tasks('prj-game').length, 5, 'GAME 태스크 5개');
eq(repo.task('GAME-142').title, '기사 캐릭터 구현', 'GAME-142 로드');

console.log('\n[2] Task 생성/수정');
const t = await repo.createTask('prj-game', { title: '신규 태스크', priority: 'HIGH' }, 'usr-choi');
eq(t.id, 'GAME-147', '다음 Task ID 채번');
await repo.updateTask(t.id, { status: 'IN_PROGRESS' }, 'usr-choi');
eq(repo.task(t.id).status, 'IN_PROGRESS', '상태 변경');
const lastLog = repo.logs({ projectId: 'prj-game', taskId: t.id })[0];
ok(lastLog.message.includes('할 일 → 진행 중'), `변경 로그 요약: ${lastLog.message}`);

console.log('\n[3] 에셋 락 상태 머신');
const a = await repo.createAsset('prj-game', { name: 'test.fbx', task_id: t.id }, 'usr-kim');
eq(a.lock_status, 'AVAILABLE', '초기 상태 AVAILABLE');
await repo.checkout(a.id, 'usr-kim');
eq(repo.asset(a.id).lock_status, 'CHECKED_OUT', '체크아웃 후 CHECKED_OUT');
let conflicted = false;
try { await repo.checkout(a.id, 'usr-choi'); } catch (e) { conflicted = e instanceof ConflictError; }
ok(conflicted, '다른 사용자 동시 체크아웃 거부');
await repo.checkin(a.id, { actorId: 'usr-kim', comment: '첫 체크인' });
eq(repo.asset(a.id).current_version, 1, '체크인 후 v1');
eq(repo.asset(a.id).lock_status, 'AVAILABLE', '체크인 후 락 해제');
eq(repo.versions(a.id).length, 1, '버전 이력 1건');
ok(repo.asset(a.id).hash.length === 64, 'SHA-256 해시 길이');
let notCheckedOut = false;
try { await repo.checkin(a.id, { actorId: 'usr-kim', comment: 'x' }); } catch (e) { notCheckedOut = e instanceof ConflictError; }
ok(notCheckedOut, '체크아웃 상태가 아니면 체크인 거부');
// 스테일 체크인: 내가 체크아웃한 뒤 다른 탭이 락을 해제한 상황(내 스냅샷은 아직 CHECKED_OUT)
await repo.checkout(a.id, 'usr-kim');
const tabB = new Repo(new LocalAdapter({ namespace: 'test' }));
await tabB.load();
await tabB.unlock(a.id, 'usr-choi');
const versionsBefore = repo.versions(a.id).length;
let staleCheckin = false;
try { await repo.checkin(a.id, { actorId: 'usr-kim', comment: '늦은 체크인' }); }
catch (e) { staleCheckin = e instanceof ConflictError; }
ok(staleCheckin, '락 상태가 바뀐 뒤의 체크인은 CAS로 거부');
eq(repo.versions(a.id).length, versionsBefore, '거부된 체크인의 버전 행은 보상 삭제된다');

console.log('\n[4] Git 이벤트 매핑');
const events = [
  { type: 'commit', sha: 'abc1234567', message: 'GAME-142 콤보 수정', author: 'choi-dev', branch: 'feature/knight', date: new Date().toISOString() },
  { type: 'commit', sha: 'def7654321', message: '리팩터링(태스크 없음)', author: 'kim-art', branch: 'chore/cleanup', date: new Date().toISOString() },
  { type: 'pull_request', number: 99, title: 'GAME-144 히트박스', author: 'choi-dev', branch: 'feature/hitbox', date: new Date().toISOString() },
];
const r1 = await repo.importGitEvents('prj-game', events, { repository: 'octocat/Hello-World', actorId: 'usr-choi' });
eq(r1.linked, 2, '2건 연결');
eq(r1.unmatched, 1, '1건 미매핑');
const r2 = await repo.importGitEvents('prj-game', events, { repository: 'octocat/Hello-World' });
eq(r2.linked, 0, '재실행 시 중복 연결 없음');
eq(r2.skipped, 2, '중복 2건 스킵');
eq(repo.task('GAME-144').git_pr, '99', 'PR 번호가 Task에 반영');

console.log('\n[5] 통합 피드');
const feed = repo.feed({ projectId: 'prj-game', limit: 100 });
ok(feed.length > 5, `피드 ${feed.length}건`);
ok(feed.every((i, idx) => idx === 0 || feed[idx - 1].at >= i.at), '시간 역순 정렬');
const gitOnly = repo.feed({ projectId: 'prj-game', sources: ['git'] });
ok(gitOnly.every((i) => i.source === 'git'), 'source 필터 동작');

console.log('\n[6] 통계 / 내보내기 / 초기화');
const s = repo.stats('prj-game');
eq(s.tasks, 6, '태스크 수');
ok(s.assets >= 4, '에셋 수');
const dump = repo.export();
ok(!!dump.data.tasks.length && !!dump.columns.tasks, '내보내기 구조');
await repo.reset();
eq(repo.projects.length, 0, '초기화 후 비어 있음');
await repo.import(dump, { merge: false });
eq(repo.tasks('prj-game').length, 6, '가져오기 복원');

console.log('\n[7] 동기화');
// 같은 namespace를 쓰는 두 번째 Repo가 "다른 탭" 역할을 한다.
const tab2 = new Repo(new LocalAdapter({ namespace: 'test' }));
await tab2.load();

const remoteTask = await tab2.createTask('prj-game', { title: '다른 탭이 만든 태스크' }, 'usr-choi');
const beforeReload = !!repo.task(remoteTask.id);
const s1 = await repo.reload();
ok(!beforeReload && s1.ok && s1.changed && !!repo.task(remoteTask.id),
  'reload가 다른 탭의 변경을 반영(LocalAdapter 캐시 제거 확인)');

let changeEvents = 0;
const countChange = () => { changeEvents++; };
repo.addEventListener('change', countChange);
const s2 = await repo.reload();
ok(s2.ok && s2.changed === false && changeEvents === 0, '변경이 없으면 change 이벤트 없이 changed:false');

await tab2.createTask('prj-game', { title: '다른 탭이 만든 태스크 2' }, 'usr-choi');
const s3 = await repo.reload();
ok(s3.changed === true && changeEvents === 1, '변경이 있으면 change 이벤트 1회 + changed:true');
repo.removeEventListener('change', countChange);

// 쓰기 중 reload는 스냅샷을 갈아끼우지 않는다. (스트레이 타이머의 영향을 받지 않도록 전용 Repo로 검증)
const busy = new Repo(new LocalAdapter({ namespace: 'test' }));
await busy.load();
const pendingTask = await tab2.createTask('prj-game', { title: '쓰기 중 태스크' }, 'usr-choi');
busy.pending = 1;
const s4 = await busy.reload();
busy.pending = 0;

// 조회를 시작한 뒤에 끼어든 쓰기도 같은 이유로 버린다(방금 쓴 행이 사라지면 안 된다).
const slow = new Repo(new LocalAdapter({ namespace: 'test' }));
await slow.load();
const listOf = slow.adapter.list.bind(slow.adapter);
slow.adapter.list = async (t) => { await new Promise((r) => setTimeout(r, 5)); return listOf(t); };
const inFlight = slow.reload();
const midTask = await slow.createTask('prj-game', { title: '조회 중 태스크' }, 'usr-choi');
const s4b = await inFlight;

ok(s4.skipped === true && s4.ok === false && !busy.task(pendingTask.id)
  && s4b.skipped === true && !!slow.task(midTask.id),
  '쓰기 중이거나 조회 중 쓰기가 끼어들면 skipped:true — 스냅샷을 교체하지 않는다');

const broken = new Repo(new LocalAdapter({ namespace: 'test' }));
await broken.load();
const keptTasks = broken.tasks('prj-game').length;
broken.adapter.list = async () => { throw new Error('조회 실패'); };
const s5 = await broken.reload({ silent: true });
let rethrew = false;
try { await broken.reload(); } catch { rethrew = true; }
ok(s5.ok === false && !!s5.error && rethrew && broken.tasks('prj-game').length === keptTasks,
  '조회 실패: silent면 {ok:false}, 아니면 throw. 어느 쪽이든 기존 스냅샷 보존');

const raceAsset = await repo.createAsset('prj-game', { name: 'sync.fbx' }, 'usr-kim');
const tab3 = new Repo(new LocalAdapter({ namespace: 'test' }));
await tab3.load();
await tab3.checkout(raceAsset.id, 'usr-choi');
let raced = false;
try { await repo.checkout(raceAsset.id, 'usr-kim'); } catch (e) { raced = e instanceof ConflictError; }
await new Promise((r) => setTimeout(r, 30));
ok(raced && repo.asset(raceAsset.id).lock_status === 'CHECKED_OUT',
  'CAS 충돌 뒤 스냅샷이 자동으로 최신화된다');

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
