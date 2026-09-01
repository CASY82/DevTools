/** 도메인 스키마 · 상수 정의 (계획서 4·6·7장). */
import { MAX_UPLOAD_MB } from '../config.js';

export const TABLES = {
  projects: 'projects',
  members: 'members',
  features: 'features',
  tasks: 'tasks',
  assets: 'assets',
  assetVersions: 'asset_versions',
  gitLinks: 'git_links',
  changeLogs: 'change_logs',
};

export const TABLE_LIST = Object.values(TABLES);

/** Sheets 헤더 및 내보내기 열 순서의 단일 출처. */
export const COLUMNS = {
  projects: ['id', 'key', 'name', 'description', 'owner_id', 'repository', 'drive_folder', 'status', 'created_at'],
  members: ['id', 'name', 'role', 'email', 'github_login'],
  features: ['id', 'project_id', 'name', 'milestone', 'created_at'],
  tasks: ['id', 'project_id', 'feature_id', 'title', 'description', 'status', 'priority',
    'assignee_id', 'git_branch', 'git_pr', 'created_at', 'updated_at'],
  assets: ['id', 'project_id', 'task_id', 'name', 'path', 'drive_file_id', 'drive_link',
    'current_version', 'hash', 'lock_status', 'locked_by', 'locked_at', 'updated_at'],
  asset_versions: ['id', 'asset_id', 'version_no', 'drive_revision_id', 'author_id', 'hash', 'comment', 'created_at'],
  git_links: ['id', 'project_id', 'task_id', 'repository', 'branch', 'commit_sha',
    'pull_request_no', 'event_type', 'message', 'author', 'url', 'created_at'],
  change_logs: ['id', 'project_id', 'task_id', 'actor_id', 'source', 'event_type', 'message', 'created_at'],
};

export const TASK_STATUS = [
  { id: 'BACKLOG', label: '백로그', tone: 'gray' },
  { id: 'TODO', label: '할 일', tone: 'blue' },
  { id: 'IN_PROGRESS', label: '진행 중', tone: 'amber' },
  { id: 'IN_REVIEW', label: '리뷰', tone: 'purple' },
  { id: 'DONE', label: '완료', tone: 'green' },
];

export const PRIORITY = [
  { id: 'LOW', label: '낮음', tone: 'gray' },
  { id: 'MEDIUM', label: '보통', tone: 'blue' },
  { id: 'HIGH', label: '높음', tone: 'amber' },
  { id: 'CRITICAL', label: '긴급', tone: 'red' },
];

/** 에셋 락 상태 머신: AVAILABLE ⇄ CHECKED_OUT → (checkin) 새 버전 → AVAILABLE */
export const LOCK_STATE = {
  AVAILABLE: { id: 'AVAILABLE', label: '사용 가능', tone: 'green' },
  CHECKED_OUT: { id: 'CHECKED_OUT', label: '체크아웃', tone: 'amber' },
};

export const SOURCES = {
  hub: { id: 'hub', label: 'Hub', icon: '🧩', tone: 'blue' },
  drive: { id: 'drive', label: 'Drive', icon: '📦', tone: 'green' },
  git: { id: 'git', label: 'Git', icon: '🔀', tone: 'purple' },
};

export const EVENTS = {
  PROJECT_CREATED: '프로젝트 생성',
  TASK_CREATED: 'Task 생성',
  TASK_UPDATED: 'Task 변경',
  TASK_DELETED: 'Task 삭제',
  ASSET_CREATED: '에셋 등록',
  ASSET_UPLOAD: '파일 업로드',
  ASSET_CHECKOUT: '체크아웃',
  ASSET_CHECKIN: '체크인',
  ASSET_UNLOCK: '락 해제',
  ASSET_DELETED: '에셋 삭제',
  GIT_COMMIT: 'Commit 연결',
  GIT_PR: 'PR 연결',
  GIT_BRANCH: 'Branch 연결',
};

/** 바이너리 = Git 머지 불가 → Exclusive Lock 기본 정책 (계획서 15장). */
export const BINARY_EXT = ['psd', 'blend', 'fbx', 'obj', 'wav', 'mp3', 'mp4', 'png', 'jpg', 'jpeg', 'tga', 'exr', 'unity', 'prefab', 'uasset'];

export const isBinaryAsset = (name) => BINARY_EXT.includes(String(name).split('.').pop()?.toLowerCase());

/** 미리보기(썸네일)를 만들 수 있는 확장자. */
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

export const isImageAsset = (name) => IMAGE_EXT.includes(String(name).split('.').pop()?.toLowerCase());

/**
 * Drive 썸네일 URL. Drive 파일에 접근 권한이 있는 계정으로 로그인한 브라우저에서만 보인다.
 * (파일 원본을 앱이 저장하지 않으므로 미리보기도 Drive에서 직접 가져온다)
 */
export const thumbUrl = (driveFileId, width = 400) =>
  (driveFileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w${width}` : '');

/** 업로드 상한(바이트). 설정 출처는 config.js 한 곳. */
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export { MAX_UPLOAD_MB };

const metaOf = (list, id, fallbackTone = 'gray') =>
  list.find((s) => s.id === id) || { id, label: id || '-', tone: fallbackTone };

export const statusMeta = (id) => metaOf(TASK_STATUS, id);
export const priorityMeta = (id) => metaOf(PRIORITY, id);
export const lockMeta = (id) => LOCK_STATE[id] || LOCK_STATE.AVAILABLE;
export const sourceMeta = (id) => SOURCES[id] || SOURCES.hub;
export const eventLabel = (id) => EVENTS[id] || id;
