/**
 * 저장소 어댑터 계약 (계획서 15장 "외부 서비스 추상화").
 *
 * 모든 어댑터는 아래 시그니처를 구현한다. 도메인 규칙(락 상태 머신, 버전 증가,
 * 변경 로그)은 repo.js가 담당하므로 어댑터는 "테이블 저장소" 역할만 한다.
 *
 *   init()                        : Promise<void>
 *   list(table)                   : Promise<Row[]>
 *   insert(table, row)            : Promise<Row>
 *   update(table, id, patch, opt) : Promise<Row>   opt.expect = 낙관적 잠금 조건
 *   remove(table, id)             : Promise<void>
 *   replaceAll(table, rows)       : Promise<void>  (가져오기/시드용)
 *
 * 선택 구현:
 *   uploadAsset(file, meta)       : Promise<{fileId, revisionId, webViewLink}>
 */

export class ConflictError extends Error {
  constructor(message = '다른 사용자가 먼저 상태를 변경했습니다.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class AdapterError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AdapterError';
    this.cause = cause;
  }
}

/** expect 조건이 현재 행과 일치하는지 검사한다. */
export function assertExpected(row, expect) {
  if (!expect) return;
  for (const [k, v] of Object.entries(expect)) {
    if ((row?.[k] ?? null) !== (v ?? null)) throw new ConflictError();
  }
}
