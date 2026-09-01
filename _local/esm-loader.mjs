/**
 * 앱 트리(../js/**)의 .js 파일을 ES 모듈로 읽기 위한 로더.
 *
 * 앱 폴더에는 package.json을 두지 않는다(순수 정적 배포물 유지). 그 대신 테스트 실행 시에만
 * 이 로더가 .js 를 ESM으로 해석하게 한다.  사용: node --experimental-loader ./esm-loader.mjs <test>
 */
export async function load(url, context, nextLoad) {
  if (url.endsWith('.js') && !url.includes('/node_modules/')) {
    return nextLoad(url, { ...context, format: 'module' });
  }
  return nextLoad(url, context);
}
