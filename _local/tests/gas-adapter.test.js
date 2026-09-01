/**
 * GAS 어댑터 계약 테스트.
 *
 * Google 계정 없이도 "설정 → 연결 적용" 이후의 동작을 검증하기 위해,
 * apps-script/Code.gs 와 동일한 프로토콜을 구현한 모의 웹앱을 띄우고
 * 실제 GasAdapter + Repo 를 그대로 붙여 실행한다.
 * (Apps Script 배포 옵션 자체는 여기서 검증할 수 없다 — README 참고)
 */
import { createServer } from 'node:http';

let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? (pass++, console.log('  ✓', label)) : (fail++, console.log('  ✗', label)); };

// ---------------------------------------------------------------- 모의 Apps Script 웹앱
const TOKEN = 'test-token';
const sheets = new Map();          // table -> rows[]
const seen = [];                   // 수신한 요청 기록
const table = (t) => (sheets.has(t) ? sheets.get(t) : (sheets.set(t, []), sheets.get(t)));

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (obj) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const q = JSON.parse(body || '{}');
    seen.push({ action: q.action, contentType: req.headers['content-type'], method: req.method });
    if (q.token !== TOKEN) return send({ error: 'UNAUTHORIZED', message: '토큰이 올바르지 않습니다.' });

    const rows = q.table ? table(q.table) : null;
    switch (q.action) {
      case 'ping': return send({ ok: true });
      case 'list': return send({ rows: rows.map((r) => ({ ...r })) });
      case 'insert': rows.push({ ...q.row }); return send({ row: q.row });
      case 'update': {
        const i = rows.findIndex((r) => String(r.id) === String(q.id));
        if (i < 0) return send({ error: 'ERROR', message: '레코드 없음: ' + q.id });
        for (const [k, v] of Object.entries(q.expect || {})) {
          if (String(rows[i][k] ?? '') !== String(v ?? '')) {
            return send({ error: 'CONFLICT', message: '다른 사용자가 먼저 상태를 변경했습니다.' });
          }
        }
        rows[i] = { ...rows[i], ...q.patch };
        return send({ row: rows[i] });
      }
      case 'remove': {
        const i = rows.findIndex((r) => String(r.id) === String(q.id));
        if (i >= 0) rows.splice(i, 1);
        return send({ ok: true });
      }
      case 'replaceAll': sheets.set(q.table, q.rows.map((r) => ({ ...r }))); return send({ ok: true });
      default: return send({ error: 'BAD_ACTION', message: '알 수 없는 액션' });
    }
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const endpoint = `http://127.0.0.1:${server.address().port}/exec`;

// ---------------------------------------------------------------- 검증
const { GasAdapter } = await import('../../js/adapters/gas.js');
const { createAdapter } = await import('../../js/adapters/index.js');
const { Repo } = await import('../../js/domain/repo.js');
const { ConflictError, AdapterError } = await import('../../js/adapters/base.js');
if (typeof globalThis.CustomEvent !== 'function') {
  globalThis.CustomEvent = class extends Event { constructor(t, o = {}) { super(t, o); this.detail = o.detail; } };
}

console.log('\n[1] 설정 화면이 넘기는 값으로 어댑터가 만들어진다');
const settingsLike = { adapter: 'gas', gasEndpoint: endpoint, gasToken: TOKEN, namespace: 'gdh' };
const adapter = createAdapter(settingsLike);
ok(adapter instanceof GasAdapter, 'adapter=gas → GasAdapter 생성');
ok(adapter.label.includes('Google Sheets'), `어댑터 라벨: ${adapter.label}`);

console.log('\n[2] 연결 적용 = ping 검사');
await adapter.init();
ok(seen[0].action === 'ping', '첫 요청은 ping');
ok(seen[0].contentType.startsWith('text/plain'), 'text/plain 본문(CORS 프리플라이트 회피)');

console.log('\n[3] 잘못된 설정은 사용자에게 이유를 알려준다');
const badToken = new GasAdapter({ endpoint, token: 'wrong' });
await badToken.init().then(() => ok(false, '토큰 오류 감지'),
  (e) => ok(e instanceof AdapterError && /토큰/.test(e.message), `토큰 오류: "${e.message}"`));
const noUrl = new GasAdapter({ endpoint: '', token: TOKEN });
await noUrl.init().then(() => ok(false, 'URL 누락 감지'),
  (e) => ok(/URL/.test(e.message), `URL 누락: "${e.message}"`));
const deadUrl = new GasAdapter({ endpoint: 'http://127.0.0.1:1/exec', token: TOKEN });
await deadUrl.init().then(() => ok(false, '연결 실패 감지'),
  (e) => ok(/연결에 실패/.test(e.message), `연결 실패: "${e.message}"`));

console.log('\n[4] 원격 저장소로 전체 도메인 기능이 동작한다');
const repo = new Repo(adapter);
await repo.load();
ok(repo.projects.length === 0, '빈 스프레드시트로 시작(데모 데이터 자동 주입 없음)');
const project = await repo.createProject({ key: 'GAME', name: '원격 프로젝트' });
const task = await repo.createTask(project.id, { title: '원격 태스크' }, '');
ok(task.id === 'GAME-101', `Task 채번: ${task.id}`);
const asset = await repo.createAsset(project.id, { name: 'remote.fbx', task_id: task.id }, '');
await repo.checkout(asset.id, 'usr-a');
ok(repo.asset(asset.id).lock_status === 'CHECKED_OUT', '원격 체크아웃');

console.log('\n[5] 동시 체크아웃은 서버 조건부 갱신(CAS)으로 막힌다');
// 다른 사용자가 이미 락을 잡은 상태를 서버에만 반영해 경합을 재현한다.
const server_rows = sheets.get('assets');
server_rows[0].lock_status = 'CHECKED_OUT';
const other = new Repo(createAdapter(settingsLike));
await other.load();
await other.unlock(asset.id, 'usr-a');                    // 서버 상태를 AVAILABLE 로
const a1 = new Repo(createAdapter(settingsLike)); await a1.load();
const a2 = new Repo(createAdapter(settingsLike)); await a2.load();
await a1.checkout(asset.id, 'usr-a');                     // 먼저 잡은 쪽 성공
let blocked = false;
try { await a2.checkout(asset.id, 'usr-b'); } catch (e) { blocked = e instanceof ConflictError; }
ok(blocked, '뒤늦은 체크아웃은 CONFLICT로 거부(다른 브라우저/PC 간 경합)');

console.log('\n[6] 로컬 → 원격 데이터 이전(내보내기 JSON 가져오기)');
const dump = { version: 1, data: { projects: [{ id: 'p1', key: 'MIG', name: '이전됨' }], tasks: [{ id: 'MIG-101', project_id: 'p1', title: '이전 태스크', status: 'TODO' }] } };
await repo.import(dump, { merge: false });
ok(sheets.get('tasks').length === 1 && sheets.get('tasks')[0].id === 'MIG-101', 'replaceAll로 시트 전체 교체');
ok(repo.tasks('p1').length === 1, '이전 후 조회 정상');

console.log('\n[7] 동기화 — 다른 사용자의 변경을 reload로 가져온다');
const viewer = new Repo(createAdapter(settingsLike));
await viewer.load();
const syncedBefore = viewer.lastSyncedAt;
await new Promise((r) => setTimeout(r, 10));      // lastSyncedAt 갱신을 밀리초 단위로 구분하기 위해
await repo.createTask('p1', { title: '다른 사용자의 태스크' }, '');
const synced = await viewer.reload();
ok(synced.ok && synced.changed && viewer.tasks('p1').length === 2 && viewer.lastSyncedAt > syncedBefore,
  '다른 Repo의 원격 변경이 reload로 반영되고 lastSyncedAt이 갱신된다');

server.close();
console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
