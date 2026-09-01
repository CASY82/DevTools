import { openForm, confirmDialog, toast, withToast } from '../core/ui.js';
import { statusOptions, priorityOptions, memberOptions, taskOptions } from './components.js';

/** 화면 여러 곳에서 재사용하는 생성/편집 다이얼로그 모음. */

export async function newTaskDialog(ctx, preset = {}) {
  const { repo, projectId } = ctx;
  if (!projectId) return toast('먼저 프로젝트를 선택하세요.', 'err');
  const features = repo.features(projectId);
  const values = await openForm({
    title: '새 Task',
    submitLabel: '생성',
    fields: [
      { name: 'title', label: '제목', required: true, placeholder: '예: 기사 캐릭터 구현', value: preset.title },
      { name: 'description', label: '설명', type: 'textarea' },
      {
        name: 'feature_id', label: 'Feature', type: 'select', value: preset.feature_id,
        options: [{ value: '', label: '미지정' }, ...features.map((f) => ({ value: f.id, label: f.name }))],
      },
      { name: 'status', label: '상태', type: 'select', value: preset.status || 'TODO', options: statusOptions() },
      { name: 'priority', label: '우선순위', type: 'select', value: 'MEDIUM', options: priorityOptions() },
      { name: 'assignee_id', label: '담당자', type: 'select', value: ctx.actorId, options: memberOptions(repo) },
      { name: 'git_branch', label: 'Git 브랜치', placeholder: 'feature/knight' },
    ],
  });
  if (!values) return null;
  const task = await withToast(repo.createTask(projectId, values, ctx.actorId), 'Task를 생성했습니다.');
  return task;
}

export async function editTaskDialog(ctx, task) {
  const { repo } = ctx;
  const features = repo.features(task.project_id);
  const values = await openForm({
    title: `${task.id} 편집`,
    wide: true,
    fields: [
      { name: 'title', label: '제목', required: true, value: task.title },
      { name: 'description', label: '설명', type: 'textarea', rows: 6, value: task.description },
      {
        name: 'feature_id', label: 'Feature', type: 'select', value: task.feature_id,
        options: [{ value: '', label: '미지정' }, ...features.map((f) => ({ value: f.id, label: f.name }))],
      },
      { name: 'status', label: '상태', type: 'select', value: task.status, options: statusOptions() },
      { name: 'priority', label: '우선순위', type: 'select', value: task.priority, options: priorityOptions() },
      { name: 'assignee_id', label: '담당자', type: 'select', value: task.assignee_id, options: memberOptions(repo) },
      { name: 'git_branch', label: 'Git 브랜치', value: task.git_branch },
      { name: 'git_pr', label: 'PR 번호', value: task.git_pr },
    ],
  });
  if (!values) return null;
  return withToast(repo.updateTask(task.id, values, ctx.actorId), '변경사항을 저장했습니다.');
}

export async function deleteTaskDialog(ctx, task) {
  const ok = await confirmDialog(`${task.id} · ${task.title} 을(를) 삭제할까요? 연결된 에셋은 유지됩니다.`,
    { title: 'Task 삭제', okLabel: '삭제', danger: true });
  if (!ok) return false;
  await withToast(ctx.repo.deleteTask(task.id, ctx.actorId), 'Task를 삭제했습니다.');
  return true;
}

export async function newAssetDialog(ctx, preset = {}) {
  const { repo, projectId } = ctx;
  if (!projectId) return toast('먼저 프로젝트를 선택하세요.', 'err');
  const values = await openForm({
    title: '에셋 등록',
    submitLabel: '등록',
    fields: [
      { name: 'name', label: '파일명', required: true, placeholder: 'knight.blend',
        hint: 'psd/blend/fbx 등 바이너리는 Exclusive Lock 정책이 적용됩니다.' },
      { name: 'path', label: '경로', placeholder: '/Art/Characters/Knight/' },
      { name: 'task_id', label: '연결 Task', type: 'select', value: preset.task_id, options: taskOptions(repo, projectId) },
      { name: 'drive_link', label: 'Drive 링크', placeholder: 'https://drive.google.com/file/d/...' },
      { name: 'drive_file_id', label: 'Drive File ID', placeholder: '선택 사항' },
    ],
  });
  if (!values) return null;
  return withToast(repo.createAsset(projectId, values, ctx.actorId), '에셋을 등록했습니다.');
}

export async function checkinDialog(ctx, asset) {
  const values = await openForm({
    title: `체크인 · ${asset.name}`,
    submitLabel: `v${Number(asset.current_version || 0) + 1} 생성`,
    fields: [
      { name: 'comment', label: '변경 코멘트', required: true, placeholder: '무엇을 바꿨나요?' },
      { name: 'file', label: '파일 (선택)', type: 'file',
        hint: '파일을 선택하면 SHA-256 해시를 계산하고, Apps Script 연결 시 Drive에 업로드합니다.' },
    ],
  });
  if (!values) return null;
  return withToast(
    ctx.repo.checkin(asset.id, { actorId: ctx.actorId, comment: values.comment, file: values.file }),
    `${asset.name} 체크인 완료`,
  );
}

export async function linkGitDialog(ctx, taskId = '') {
  const { repo, projectId } = ctx;
  const project = repo.project(projectId);
  const values = await openForm({
    title: 'Git 링크 수동 연결',
    fields: [
      { name: 'task_id', label: 'Task', type: 'select', required: true, value: taskId, options: taskOptions(repo, projectId, { includeEmpty: '' }) },
      { name: 'event_type', label: '유형', type: 'select', value: 'GIT_COMMIT',
        options: [{ value: 'GIT_COMMIT', label: 'Commit' }, { value: 'GIT_PR', label: 'Pull Request' }, { value: 'GIT_BRANCH', label: 'Branch' }] },
      { name: 'repository', label: '저장소', value: project?.repository || '', placeholder: 'owner/repo' },
      { name: 'branch', label: '브랜치', placeholder: 'feature/knight' },
      { name: 'commit_sha', label: 'Commit SHA', placeholder: '선택 사항' },
      { name: 'pull_request_no', label: 'PR 번호', placeholder: '선택 사항' },
      { name: 'message', label: '메시지', placeholder: 'GAME-142 기사 콤보 추가' },
      { name: 'url', label: 'URL', placeholder: '선택 사항' },
    ],
  });
  if (!values) return null;
  return withToast(repo.addGitLink(projectId, values, ctx.actorId), 'Git 링크를 연결했습니다.');
}

export async function projectDialog(ctx, project = null) {
  const { repo } = ctx;
  const values = await openForm({
    title: project ? '프로젝트 편집' : '새 프로젝트',
    fields: [
      { name: 'key', label: '프로젝트 키', required: true, value: project?.key || '',
        placeholder: 'GAME', hint: 'Task ID 접두사로 쓰입니다(GAME-142).' },
      { name: 'name', label: '이름', required: true, value: project?.name || '' },
      { name: 'description', label: '설명', type: 'textarea', rows: 3, value: project?.description || '' },
      { name: 'owner_id', label: 'Owner', type: 'select', value: project?.owner_id || ctx.actorId, options: memberOptions(repo) },
      { name: 'repository', label: 'GitHub 저장소', value: project?.repository || '', placeholder: 'owner/repo' },
      { name: 'drive_folder', label: 'Drive 폴더 ID', value: project?.drive_folder || '', placeholder: '선택 사항' },
    ],
  });
  if (!values) return null;
  if (project) return withToast(repo.updateProject(project.id, values), '프로젝트를 수정했습니다.');
  return withToast(repo.createProject(values), '프로젝트를 생성했습니다.');
}

export async function memberDialog(ctx, member = null) {
  const values = await openForm({
    title: member ? '멤버 편집' : '멤버 추가',
    fields: [
      { name: 'name', label: '이름', required: true, value: member?.name || '' },
      { name: 'role', label: '역할', value: member?.role || 'Developer' },
      { name: 'email', label: '이메일', type: 'email', value: member?.email || '' },
      { name: 'github_login', label: 'GitHub 계정', value: member?.github_login || '' },
    ],
  });
  if (!values) return null;
  return member
    ? withToast(ctx.repo.updateMember(member.id, values), '멤버 정보를 수정했습니다.')
    : withToast(ctx.repo.createMember(values), '멤버를 추가했습니다.');
}
