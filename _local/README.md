# _local · 로컬 개발/테스트 하네스

**이 폴더는 배포물이 아닙니다.** 상위 폴더(`gamedev-hub/`)의 앱은 이 폴더 없이도 완전히 동작하며,
앱 코드는 `_local/` 을 단 한 줄도 참조하지 않습니다(`tests/separation.test.js` 가 매번 검증).
GitHub Pages에 올릴 때 통째로 제외하면 됩니다.

```gitignore
# 상위 .gitignore 에서 주석만 해제하면 됩니다
_local/
```

## 1. 화면 확인 (Apps Script·GitHub 연동 없이)

```bash
python3 _local/serve.py          # 기본 8080 포트, 의존성 없음
```

| 주소 | 내용 |
|---|---|
| http://localhost:8080/ | 앱 본체 (브라우저 localStorage만 사용) |
| http://localhost:8080/_local/preview.html | **화면 미리보기 하네스** |

미리보기 하네스 기능:

* 왼쪽 목록에서 11개 화면(필터가 걸린 상태 포함)을 즉시 전환
* **전체 화면 한눈에** 모드 — 모든 화면을 축소 그리드로 동시 렌더
* 뷰포트 프리셋 — 데스크톱 1440 / 노트북 1280 / 태블릿 834 / 모바일 390 (반응형 확인)
* 데이터 도구 — 데모 재주입 / 대용량 샘플(Task 200건) / 빈 상태 / 저장소 완전 삭제

데이터 도구는 앱과 동일한 도메인 계층(`Repo` + `LocalAdapter`)을 그대로 사용하므로,
미리보기에서 만든 상태가 앱에서 보는 상태와 정확히 같습니다. 네트워크 호출은 일절 없습니다.

> ES 모듈은 `file://` 로 열리지 않습니다. 반드시 위 서버(또는 다른 정적 서버)를 통해 접속하세요.

## 2. 테스트

```bash
cd _local
npm test         # 의존성 없이 실행 (도메인 27 · 뷰 렌더 18 · GAS 계약 13 · 분리/라우트 8)
npm i            # jsdom 설치 (DOM 테스트용, 최초 1회)
npm run test:dom # 앱 부팅~조작 24 · 미리보기 하네스 12
npm run test:all # 전부
```

| 파일 | 검증 내용 |
|---|---|
| `tests/domain.test.js` | Task 채번·변경 로그 요약, 에셋 락 상태 머신(동시 체크아웃 거부, 체크인 버전 증가), Git 매핑·중복 스킵, 피드 정렬/필터, 내보내기·가져오기 |
| `tests/views.test.js` | 전 화면이 예외 없이 렌더되는지 + 데이터가 비어 있을 때의 안전성 |
| `tests/gas-adapter.test.js` | Apps Script 프로토콜을 흉내 낸 모의 웹앱에 실제 어댑터를 붙여, 연결 적용(ping)·오류 메시지·원격 CRUD·동시 체크아웃 거부·데이터 이전 검증 |
| `tests/separation.test.js` | 앱이 `_local/` 을 참조하지 않는지, 미리보기 라우트가 앱 라우트와 일치하는지, 하네스가 원격 연동을 쓰지 않는지 |
| `tests/boot.test.js` | jsdom에서 실제 부팅 → 라우팅 → 모달 → 체크아웃/체크인 → 검색 → 영속화 |
| `tests/preview.test.js` | 미리보기 하네스 자체(화면 전환, 갤러리, 뷰포트, 데이터 도구) |

`esm-loader.mjs` 는 앱 폴더에 `package.json` 을 두지 않기 위한 장치입니다.
테스트 실행 시에만 앱의 `.js` 를 ES 모듈로 해석하며, 브라우저 동작에는 아무 영향이 없습니다.

## 3. 구성

```
_local/
├─ serve.py            캐시 없는 정적 서버 (표준 라이브러리만)
├─ preview.html/.js    화면 미리보기 하네스
├─ esm-loader.mjs      테스트 전용 ESM 로더
├─ package.json        테스트 스크립트 + jsdom (devDependency)
└─ tests/              테스트 5종
```
