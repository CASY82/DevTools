import { TABLES } from './schema.js';
import { nowIso } from '../core/util.js';

const day = 86400000;
const ago = (d, h = 0) => new Date(Date.now() - d * day - h * 3600000).toISOString();

/**
 * 데모 데이터 (계획서 5장의 "GAME-142 · 기사 캐릭터 구현" 예시를 그대로 재현).
 * 첫 실행 시 자동 주입되며, 설정에서 다시 넣거나 초기화할 수 있다.
 */
export function seedData() {
  const members = [
    { id: 'usr-choi', name: '최개발', role: 'Client Programmer', email: 'choi@example.com', github_login: 'choi-dev' },
    { id: 'usr-kim', name: '김아트', role: 'Character Artist', email: 'kim@example.com', github_login: 'kim-art' },
    { id: 'usr-park', name: '박기획', role: 'Game Designer', email: 'park@example.com', github_login: 'park-gd' },
    { id: 'usr-lee', name: '이사운드', role: 'Sound Designer', email: 'lee@example.com', github_login: 'lee-snd' },
  ];

  const projects = [
    {
      id: 'prj-game', key: 'GAME', name: 'Project Valkyrie', description: '3D 액션 RPG 본편 개발',
      owner_id: 'usr-park', repository: 'octocat/Hello-World', drive_folder: '', status: 'ACTIVE', created_at: ago(120),
    },
    {
      id: 'prj-tool', key: 'TOOL', name: '내부 툴체인', description: '빌드/파이프라인 자동화 도구',
      owner_id: 'usr-choi', repository: '', drive_folder: '', status: 'ACTIVE', created_at: ago(60),
    },
  ];

  const features = [
    { id: 'ftr-char', project_id: 'prj-game', name: '캐릭터 시스템', milestone: 'M1 · 전투 프로토타입', created_at: ago(100) },
    { id: 'ftr-combat', project_id: 'prj-game', name: '전투 시스템', milestone: 'M1 · 전투 프로토타입', created_at: ago(95) },
    { id: 'ftr-audio', project_id: 'prj-game', name: '오디오', milestone: 'M2 · 콘텐츠 확장', created_at: ago(40) },
    { id: 'ftr-build', project_id: 'prj-tool', name: '빌드 파이프라인', milestone: 'M1', created_at: ago(55) },
  ];

  const T = (id, o) => ({
    id, project_id: 'prj-game', feature_id: '', title: '', description: '', status: 'TODO',
    priority: 'MEDIUM', assignee_id: '', git_branch: '', git_pr: '',
    created_at: ago(20), updated_at: ago(1), ...o,
  });

  const tasks = [
    T('GAME-142', {
      feature_id: 'ftr-char', title: '기사 캐릭터 구현', status: 'IN_PROGRESS', priority: 'HIGH',
      assignee_id: 'usr-choi', git_branch: 'feature/knight', git_pr: '31',
      description: '기사 캐릭터의 메시·리깅·애니메이션을 인게임에 연결한다.\n- knight.blend 리깅 확정\n- FBX 익스포트 규칙 준수\n- 공격 3콤보 애니메이션 연동',
      created_at: ago(14), updated_at: ago(0, 3),
    }),
    T('GAME-143', {
      feature_id: 'ftr-char', title: '캐릭터 아웃라인 셰이더', status: 'IN_REVIEW', priority: 'MEDIUM',
      assignee_id: 'usr-kim', git_branch: 'feature/outline-shader', git_pr: '33',
      description: '툰 렌더링용 아웃라인 셰이더 적용 및 성능 측정.', created_at: ago(10), updated_at: ago(1),
    }),
    T('GAME-144', {
      feature_id: 'ftr-combat', title: '피격 판정 히트박스 리팩터링', status: 'TODO', priority: 'CRITICAL',
      assignee_id: 'usr-choi', description: '캡슐 콜라이더 기반으로 통일하고 프레임 데이터 테이블화.',
      created_at: ago(6), updated_at: ago(2),
    }),
    T('GAME-145', {
      feature_id: 'ftr-audio', title: '타격음 세트 1차 적용', status: 'BACKLOG', priority: 'LOW',
      assignee_id: 'usr-lee', description: '검·둔기·마법 타격음 각 3종 제작 후 적용.',
      created_at: ago(4), updated_at: ago(4),
    }),
    T('GAME-146', {
      feature_id: 'ftr-char', title: '캐릭터 셀렉트 UI', status: 'DONE', priority: 'MEDIUM',
      assignee_id: 'usr-park', git_branch: 'feature/select-ui', git_pr: '28',
      description: '캐릭터 선택 화면 레이아웃 및 프리뷰 카메라.', created_at: ago(30), updated_at: ago(8),
    }),
    T('TOOL-101', {
      project_id: 'prj-tool', feature_id: 'ftr-build', title: '야간 빌드 자동화', status: 'IN_PROGRESS',
      priority: 'HIGH', assignee_id: 'usr-choi', description: '매일 02:00 자동 빌드 후 결과 리포트 발송.',
      created_at: ago(12), updated_at: ago(3),
    }),
  ];

  const assets = [
    {
      id: 'ast-knight-blend', project_id: 'prj-game', task_id: 'GAME-142', name: 'knight.blend',
      path: '/Art/Characters/Knight/', drive_file_id: 'demo-blend', drive_link: '',
      current_version: 7, hash: 'a1b2c3d4e5f60718', lock_status: 'CHECKED_OUT',
      locked_by: 'usr-kim', locked_at: ago(0, 5), updated_at: ago(0, 5),
    },
    {
      id: 'ast-knight-fbx', project_id: 'prj-game', task_id: 'GAME-142', name: 'knight.fbx',
      path: '/Art/Characters/Knight/', drive_file_id: 'demo-fbx', drive_link: '',
      current_version: 12, hash: '9f8e7d6c5b4a3021', lock_status: 'AVAILABLE',
      locked_by: '', locked_at: '', updated_at: ago(1),
    },
    {
      id: 'ast-knight-spec', project_id: 'prj-game', task_id: 'GAME-142', name: 'knight_spec.pdf',
      path: '/Docs/Characters/', drive_file_id: 'demo-pdf', drive_link: '',
      current_version: 3, hash: '11aa22bb33cc44dd', lock_status: 'AVAILABLE',
      locked_by: '', locked_at: '', updated_at: ago(9),
    },
    {
      id: 'ast-hit-wav', project_id: 'prj-game', task_id: 'GAME-145', name: 'sword_hit_01.wav',
      path: '/Audio/SFX/Combat/', drive_file_id: '', drive_link: '',
      current_version: 1, hash: '55ee66ff77aa88bb', lock_status: 'AVAILABLE',
      locked_by: '', locked_at: '', updated_at: ago(4),
    },
  ];

  const V = (id, asset_id, version_no, author_id, comment, at) => ({
    id, asset_id, version_no, drive_revision_id: `rev-${version_no}`, author_id,
    hash: `${asset_id.slice(-4)}${version_no}`.padEnd(16, '0'), comment, created_at: at,
  });

  const asset_versions = [
    V('ver-b5', 'ast-knight-blend', 5, 'usr-kim', '갑옷 하이폴리 정리', ago(12)),
    V('ver-b6', 'ast-knight-blend', 6, 'usr-kim', '리깅 웨이트 수정', ago(6)),
    V('ver-b7', 'ast-knight-blend', 7, 'usr-kim', '공격 콤보 3종 애니메이션 추가', ago(2)),
    V('ver-f11', 'ast-knight-fbx', 11, 'usr-kim', '스케일 100 적용 후 재익스포트', ago(3)),
    V('ver-f12', 'ast-knight-fbx', 12, 'usr-choi', '루트모션 옵션 켜서 재익스포트', ago(1)),
    V('ver-p3', 'ast-knight-spec', 3, 'usr-park', '스킬 수치 밸런스 표 갱신', ago(9)),
    V('ver-w1', 'ast-hit-wav', 1, 'usr-lee', '초안 업로드', ago(4)),
  ];

  const git_links = [
    {
      id: 'git-1', project_id: 'prj-game', task_id: 'GAME-142', repository: 'octocat/Hello-World',
      branch: 'feature/knight', commit_sha: '3f9a1c27b6d4e8a05c1', pull_request_no: '',
      event_type: 'GIT_COMMIT', message: 'GAME-142 기사 공격 콤보 상태머신 추가', author: 'choi-dev',
      url: '', created_at: ago(1, 4),
    },
    {
      id: 'git-2', project_id: 'prj-game', task_id: 'GAME-142', repository: 'octocat/Hello-World',
      branch: 'feature/knight', commit_sha: '', pull_request_no: '31',
      event_type: 'GIT_PR', message: 'GAME-142 기사 캐릭터 구현', author: 'choi-dev',
      url: '', created_at: ago(0, 6),
    },
    {
      id: 'git-3', project_id: 'prj-game', task_id: 'GAME-143', repository: 'octocat/Hello-World',
      branch: 'feature/outline-shader', commit_sha: '77c2e10ab93f4d6', pull_request_no: '33',
      event_type: 'GIT_COMMIT', message: 'GAME-143 아웃라인 두께 카메라 거리 보정', author: 'kim-art',
      url: '', created_at: ago(1, 2),
    },
  ];

  const L = (id, o) => ({
    id, project_id: 'prj-game', task_id: '', actor_id: '', source: 'hub',
    event_type: 'TASK_UPDATED', message: '', created_at: ago(1), ...o,
  });

  const change_logs = [
    L('log-1', { task_id: 'GAME-142', actor_id: 'usr-choi', event_type: 'TASK_CREATED', message: 'GAME-142 · 기사 캐릭터 구현', created_at: ago(14) }),
    L('log-2', { task_id: 'GAME-142', actor_id: 'usr-kim', source: 'drive', event_type: 'ASSET_CHECKIN', message: 'knight.fbx v12 체크인 · 루트모션 옵션 켜서 재익스포트', created_at: ago(1) }),
    L('log-3', { task_id: 'GAME-142', actor_id: 'usr-choi', event_type: 'TASK_UPDATED', message: '상태: 할 일 → 진행 중', created_at: ago(1, 6) }),
    L('log-4', { task_id: 'GAME-142', actor_id: 'usr-kim', source: 'drive', event_type: 'ASSET_CHECKOUT', message: 'knight.blend 체크아웃', created_at: ago(0, 5) }),
    L('log-5', { task_id: 'GAME-146', actor_id: 'usr-park', event_type: 'TASK_UPDATED', message: '상태: 리뷰 → 완료', created_at: ago(8) }),
    L('log-6', { project_id: 'prj-tool', task_id: 'TOOL-101', actor_id: 'usr-choi', event_type: 'TASK_CREATED', message: 'TOOL-101 · 야간 빌드 자동화', created_at: ago(12) }),
  ];

  return {
    version: 1,
    exported_at: nowIso(),
    data: {
      [TABLES.projects]: projects,
      [TABLES.members]: members,
      [TABLES.features]: features,
      [TABLES.tasks]: tasks,
      [TABLES.assets]: assets,
      [TABLES.assetVersions]: asset_versions,
      [TABLES.gitLinks]: git_links,
      [TABLES.changeLogs]: change_logs,
    },
  };
}
