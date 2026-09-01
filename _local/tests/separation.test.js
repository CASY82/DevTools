// 배포물(앱)과 로컬 하네스의 분리 · 라우트 동기화 검증
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LOCAL_DIR = fileURLToPath(new URL('../', import.meta.url));

let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? (pass++, console.log('  ✓', label)) : (fail++, console.log('  ✗', label)); };

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (full.startsWith(LOCAL_DIR) || name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

console.log('\n[1] 앱은 로컬 하네스에 의존하지 않는다');
const appFiles = walk(APP_ROOT);
const leaks = appFiles.filter((f) => /\.(js|html|css|gs|json)$/.test(f) && readFileSync(f, 'utf8').includes('_local/'));
ok(leaks.length === 0, `배포 파일 ${appFiles.length}개 중 _local 참조 ${leaks.length}건${leaks.length ? `: ${leaks.map((f) => relative(APP_ROOT, f)).join(', ')}` : ''}`);
ok(!appFiles.some((f) => /package\.json$/.test(f)), '앱 루트에 package.json 없음(순수 정적 배포물)');
ok(!appFiles.some((f) => /\.test\.js$/.test(f)), '앱 트리에 테스트 파일 없음');

console.log('\n[2] 미리보기 라우트가 앱 라우트와 일치한다');
const mainSrc = readFileSync(join(APP_ROOT, 'js/main.js'), 'utf8');
const appRoutes = [...mainSrc.matchAll(/^\s*'(\/[^']*)':/gm)].map((m) => m[1]);
const previewSrc = readFileSync(join(LOCAL_DIR, 'preview.js'), 'utf8');
const previewPatterns = [...previewSrc.matchAll(/pattern:\s*'([^']+)'/g)].map((m) => m[1]);
ok(appRoutes.length >= 9, `앱 라우트 ${appRoutes.length}개 추출`);
const unknown = previewPatterns.filter((p) => !appRoutes.includes(p));
ok(unknown.length === 0, `미리보기 라우트 전부 유효${unknown.length ? `: 알 수 없음 ${unknown.join(', ')}` : ''}`);
const uncovered = appRoutes.filter((p) => !previewPatterns.includes(p));
ok(uncovered.length === 0, `모든 앱 화면이 미리보기에 포함${uncovered.length ? `: 누락 ${uncovered.join(', ')}` : ''}`);

console.log('\n[3] 로컬 하네스가 원격 연동을 쓰지 않는다');
const harness = ['preview.js', 'preview.html', 'serve.py'].map((f) => readFileSync(join(LOCAL_DIR, f), 'utf8')).join('\n');
ok(!/GasAdapter|script\.google\.com|api\.github\.com/.test(harness), 'Apps Script·GitHub 호출 없음');
ok(/LocalAdapter/.test(harness), 'localStorage 어댑터만 사용');

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
