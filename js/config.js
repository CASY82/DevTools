/**
 * 배포 설정 — 팀 배포본에서 고치는 파일은 여기 하나다.
 *
 * Apps Script 웹앱 URL은 비밀이 아니다. 모든 데이터 액션은 Code.gs 의 `requireSession()` 을
 * 통과해야 하므로 URL만 알아도 데이터에는 접근할 수 없다. 어차피 로그인 요청에서
 * 네트워크 탭에 노출되는 값이라, 코드에 넣는다고 새로 새는 정보도 없다.
 *
 * 반대로 Code.gs 의 SHARED_TOKEN(관리자 설정 키)은 절대 여기에 두지 않는다.
 * 최초 관리자 계정을 만들 때 한 번 손으로 입력하는 값이며, 코드에 박으면
 * 누구나 관리자를 만들 수 있게 된다.
 */

/** 예: 'https://script.google.com/macros/s/AKfy.../exec' — 비워두면 로그인 화면에서 직접 입력받는다. */
export const DEFAULT_GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwVvSydHJH5gN7gFBBNnQQH043b1-ngIMlud-oOWMwziWNKMq6nQsMPN-Onjbxx0Rc/exec';

/** 업로드 상한. Apps Script 요청 본문 한도(base64 인코딩으로 약 1.33배 팽창)를 고려한 보수적인 값. */
export const MAX_UPLOAD_MB = 20;
