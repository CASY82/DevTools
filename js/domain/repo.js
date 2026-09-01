import { TABLES, TABLE_LIST, COLUMNS, EVENTS, isBinaryAsset, statusMeta, priorityMeta } from './schema.js';
import { uid, nowIso, byDesc, byAsc, sha256 } from '../core/util.js';
import { ConflictError, AdapterError } from '../adapters/base.js';
import { extractTaskKeys } from '../adapters/github.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * 최신순 정렬. 타임스탬프가 같은 경우(같은 밀리초에 기록된 로그 등)에는
 * 나중에 저장된 행을 더 최신으로 취급해 순서가 흔들리지 않게 한다.
 */
function recent(rows, key = 'created_at') {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (a.row[key] < b.row[key] ? 1 : a.row[key] > b.row[key] ? -1 : b.index - a.index))
    .map((x) => x.row);
}

/**
 * 도메인 저장소 계층.
 *
 * - 어댑터는 테이블 입출력만 담당하고, 모든 업무 규칙은 여기에 모은다.
 * - 전체 데이터를 메모리에 스냅샷으로 유지하여(Sheets 왕복 최소화) 조회는 동기,
 *   변경은 비동기(원격 반영 후 스냅샷 갱신)로 처리한다.
 * - 변경이 끝나면 'change' 이벤트를 발생시켜 뷰가 다시 그린다.
 */
export class Repo extends EventTarget {
  constructor(adapter) {
    super();
    this.adapter = adapter;
    this.data = Object.fromEntries(TABLE_LIST.map((t) => [t, []]));
    this.loaded = false;
    this.lastSyncedAt = '';      // 마지막 성공 조회 시각(ISO). 실패해도 갱신하지 않는다.
    this.syncing = false;        // reload 진행 중
    this.pending = 0;            // 진행 중인 쓰기 작업 수 (reload와의 경합 방지)
    this.writes = 0;             // 완료된 쓰기 횟수. 조회 중에 끼어든 쓰기를 감지한다.
    this.lastSyncError = null;   // 마지막 조회 실패 오류(없으면 null)
  }

  // ---------------------------------------------------------------- 로딩
  /** 어댑터에서 전 테이블을 읽어 스냅샷으로 만든다. load/reload 공용. */
  async #fetchAll() {
    await this.adapter.init();
    const results = await Promise.all(TABLE_LIST.map((t) => this.adapter.list(t)));
    return Object.fromEntries(TABLE_LIST.map((t, i) => [t, results[i] || []]));
  }

  async load() {
    this.data = await this.#fetchAll();
    this.loaded = true;
    this.lastSyncedAt = nowIso();
    this.lastSyncError = null;
    this.#emit();
  }

  /**
   * 저장소에서 최신 스냅샷을 다시 읽는다. 화면 상태(loaded)는 유지하므로 깜빡임이 없다.
   *
   * @param {{silent?: boolean}} opts silent=true면 실패해도 throw하지 않고 결과에 담아 돌려준다.
   * @returns {Promise<{ok:boolean, changed:boolean, skipped:boolean, at:string, error:Error|null}>}
   */
  async reload({ silent = false } = {}) {
    // 쓰기가 진행 중이면 스냅샷을 갈아끼우지 않는다(방금 쓴 행이 사라지는 것을 막는다).
    if (this.pending > 0 || this.syncing) {
      return { ok: false, changed: false, skipped: true, at: this.lastSyncedAt, error: null };
    }

    this.syncing = true;
    try {
      const before = this.#fingerprint();
      const writesBefore = this.writes;
      const next = await this.#fetchAll();
      // 조회하는 동안 쓰기가 시작되거나 끝났다면 그 결과가 빠진 스냅샷이다. 버리고 다음 기회에 다시 읽는다.
      if (this.pending > 0 || this.writes !== writesBefore) {
        return { ok: false, changed: false, skipped: true, at: this.lastSyncedAt, error: null };
      }
      this.data = next;
      this.loaded = true;
      this.lastSyncedAt = nowIso();
      this.lastSyncError = null;
      const changed = this.#fingerprint() !== before;
      if (changed) this.#emit();
      return { ok: true, changed, skipped: false, at: this.lastSyncedAt, error: null };
    } catch (e) {
      // 실패해도 기존 스냅샷은 그대로 둔다. 낡은 화면이 빈 화면보다 낫다.
      this.lastSyncError = e;
      if (!silent) throw e;
      return { ok: false, changed: false, skipped: false, at: this.lastSyncedAt, error: e };
    } finally {
      this.syncing = false;
    }
  }

  /**
   * 테이블별 (행 수 + 최신 타임스탬프) 지문. 불필요한 재렌더를 막는 용도다.
   * members처럼 시각 열이 없는 테이블은 행 수가 같으면 내용 변경을 감지하지 못한다
   * (수동 동기화는 지문과 무관하게 다시 그리므로 사용자가 막히지는 않는다).
   */
  #fingerprint() {
    return TABLE_LIST.map((t) => {
      const rows = this.data[t] || [];
      let stamp = '';
      for (const r of rows) {
        const ts = r.updated_at || r.created_at || '';
        if (ts > stamp) stamp = ts;
      }
      return `${t}:${rows.length}:${stamp}`;
    }).join('|');
  }

  #emit() { this.dispatchEvent(new CustomEvent('change')); }

  #rows(table) { return this.data[table]; }

  async #insert(table, row) {
    this.pending++;
    try {
      const saved = await this.adapter.insert(table, row);
      this.data[table] = [...this.data[table], saved];
      return saved;
    } catch (e) {
      this.#recoverFromConflict(e);
      throw e;
    } finally {
      this.pending--;
      this.writes++;
    }
  }

  async #update(table, id, patch, opts) {
    this.pending++;
    try {
      const saved = await this.adapter.update(table, id, patch, opts);
      this.data[table] = this.data[table].map((r) => (r.id === id ? saved : r));
      return saved;
    } catch (e) {
      this.#recoverFromConflict(e);
      throw e;
    } finally {
      this.pending--;
      this.writes++;
    }
  }

  async #remove(table, id) {
    this.pending++;
    try {
      await this.adapter.remove(table, id);
      this.data[table] = this.data[table].filter((r) => r.id !== id);
    } catch (e) {
      this.#recoverFromConflict(e);
      throw e;
    } finally {
      this.pending--;
      this.writes++;
    }
  }

  /**
   * CAS 충돌은 "내 화면이 낡았다"는 신호다. 최신 스냅샷을 다시 읽어 화면을 정정한다.
   * pending 감소와 보상 처리가 끝난 뒤에 실행되어야 하므로 다음 태스크로 미룬다
   * (예약만 하고 기다리지 않는다). reload는 쓰기를 하지 않으므로 재귀 위험이 없다.
   */
  #recoverFromConflict(e) {
    if (!(e instanceof ConflictError)) return;
    setTimeout(() => { this.reload({ silent: true }).catch(() => {}); }, 0);
  }

  /** 변경 로그 기록. 실패해도 본 작업을 되돌리지 않는다(로그는 보조 데이터). */
  async log({ project_id, task_id = '', actor_id = '', source = 'hub', event_type, message }) {
    const row = {
      id: uid('log'), project_id, task_id, actor_id, source, event_type, message,
      created_at: nowIso(),
    };
    try { return await this.#insert(TABLES.changeLogs, row); }
    catch (e) { console.warn('[repo] change log 기록 실패', e); return null; }
  }

  // ------------------------------------------------------------- 조회(동기)
  get projects() { return [...this.#rows(TABLES.projects)].sort(byAsc('name')); }
  get members() { return [...this.#rows(TABLES.members)].sort(byAsc('name')); }

  project(id) { return this.#rows(TABLES.projects).find((p) => p.id === id) || null; }
  member(id) { return this.#rows(TABLES.members).find((m) => m.id === id) || null; }
  memberName(id) { return this.member(id)?.name || (id ? '알 수 없음' : '미지정'); }

  features(projectId) {
    return this.#rows(TABLES.features).filter((f) => f.project_id === projectId).sort(byAsc('name'));
  }

  tasks(projectId) {
    const rows = this.#rows(TABLES.tasks);
    return recent(projectId ? rows.filter((t) => t.project_id === projectId) : [...rows], 'updated_at');
  }

  task(id) { return this.#rows(TABLES.tasks).find((t) => t.id === id) || null; }

  assets(projectId, taskId) {
    return this.#rows(TABLES.assets)
      .filter((a) => (!projectId || a.project_id === projectId) && (!taskId || a.task_id === taskId))
      .sort(byAsc('name'));
  }

  asset(id) { return this.#rows(TABLES.assets).find((a) => a.id === id) || null; }

  versions(assetId) {
    return this.#rows(TABLES.assetVersions).filter((v) => v.asset_id === assetId)
      .sort((a, b) => Number(b.version_no) - Number(a.version_no));
  }

  gitLinks(projectId, taskId) {
    return recent(this.#rows(TABLES.gitLinks)
      .filter((g) => (!projectId || g.project_id === projectId) && (!taskId || g.task_id === taskId)));
  }

  logs({ projectId, taskId, source, limit = 200 } = {}) {
    return recent(this.#rows(TABLES.changeLogs)
      .filter((l) => (!projectId || l.project_id === projectId)
        && (!taskId || l.task_id === taskId)
        && (!source || l.source === source)))
      .slice(0, limit);
  }

  /** 프로젝트 대시보드 지표. */
  stats(projectId) {
    const tasks = this.tasks(projectId);
    const assets = this.assets(projectId);
    const byStatus = tasks.reduce((acc, t) => (acc[t.status] = (acc[t.status] || 0) + 1, acc), {});
    return {
      tasks: tasks.length,
      done: byStatus.DONE || 0,
      inProgress: (byStatus.IN_PROGRESS || 0) + (byStatus.IN_REVIEW || 0),
      byStatus,
      assets: assets.length,
      locked: assets.filter((a) => a.lock_status === 'CHECKED_OUT').length,
      gitLinks: this.gitLinks(projectId).length,
      critical: tasks.filter((t) => t.priority === 'CRITICAL' && t.status !== 'DONE').length,
    };
  }

  // ------------------------------------------------------------ 프로젝트/멤버
  async createProject({ key, name, description = '', owner_id = '', repository = '', drive_folder = '' }) {
    const normKey = String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!normKey) throw new AdapterError('프로젝트 키는 영문/숫자 1자 이상이어야 합니다.');
    if (this.projects.some((p) => p.key === normKey)) throw new ConflictError(`이미 사용 중인 키입니다: ${normKey}`);
    const row = {
      id: uid('prj'), key: normKey, name: name || normKey, description, owner_id,
      repository, drive_folder, status: 'ACTIVE', created_at: nowIso(),
    };
    await this.#insert(TABLES.projects, row);
    await this.log({ project_id: row.id, actor_id: owner_id, event_type: 'PROJECT_CREATED', message: `프로젝트 ${row.name}(${row.key}) 생성` });
    this.#emit();
    return row;
  }

  async updateProject(id, patch) {
    const row = await this.#update(TABLES.projects, id, patch);
    this.#emit();
    return row;
  }

  async deleteProject(id) {
    const kill = (table, pred) => Promise.all(this.#rows(table).filter(pred).map((r) => this.#remove(table, r.id)));
    const taskIds = new Set(this.tasks(id).map((t) => t.id));
    const assetIds = new Set(this.assets(id).map((a) => a.id));
    await kill(TABLES.assetVersions, (v) => assetIds.has(v.asset_id));
    await kill(TABLES.assets, (a) => a.project_id === id);
    await kill(TABLES.gitLinks, (g) => g.project_id === id || taskIds.has(g.task_id));
    await kill(TABLES.changeLogs, (l) => l.project_id === id);
    await kill(TABLES.features, (f) => f.project_id === id);
    await kill(TABLES.tasks, (t) => t.project_id === id);
    await this.#remove(TABLES.projects, id);
    this.#emit();
  }

  async createMember({ name, role = 'Developer', email = '', github_login = '' }) {
    const row = { id: uid('usr'), name, role, email, github_login };
    await this.#insert(TABLES.members, row);
    this.#emit();
    return row;
  }

  async updateMember(id, patch) { const r = await this.#update(TABLES.members, id, patch); this.#emit(); return r; }
  async deleteMember(id) { await this.#remove(TABLES.members, id); this.#emit(); }

  async createFeature(projectId, { name, milestone = '' }) {
    const row = { id: uid('ftr'), project_id: projectId, name, milestone, created_at: nowIso() };
    await this.#insert(TABLES.features, row);
    this.#emit();
    return row;
  }

  // -------------------------------------------------------------------- Task
  /** GAME-142 형식의 다음 Task ID를 만든다. */
  nextTaskId(projectId) {
    const key = this.project(projectId)?.key || 'TASK';
    const max = this.#rows(TABLES.tasks)
      .filter((t) => t.project_id === projectId)
      .reduce((m, t) => Math.max(m, Number(String(t.id).split('-').pop()) || 0), 100);
    return `${key}-${max + 1}`;
  }

  async createTask(projectId, input, actorId = '') {
    const ts = nowIso();
    const row = {
      id: this.nextTaskId(projectId),
      project_id: projectId,
      feature_id: input.feature_id || '',
      title: input.title?.trim() || '제목 없음',
      description: input.description || '',
      status: input.status || 'TODO',
      priority: input.priority || 'MEDIUM',
      assignee_id: input.assignee_id || '',
      git_branch: input.git_branch || '',
      git_pr: input.git_pr || '',
      created_at: ts,
      updated_at: ts,
    };
    await this.#insert(TABLES.tasks, row);
    await this.log({
      project_id: projectId, task_id: row.id, actor_id: actorId,
      event_type: 'TASK_CREATED', message: `${row.id} · ${row.title}`,
    });
    this.#emit();
    return row;
  }

  /**
   * Task 갱신은 의도적으로 CAS(expect)를 걸지 않는다 — 마지막 쓰기 우선.
   * 상태·담당자는 상태 머신이 아니라 단순 필드라 덮어써도 change_logs에 양쪽 기록이 남아
   * 복구할 수 있고, CAS를 걸면 보드 드래그가 남의 변경 때문에 자주 실패한다.
   */
  async updateTask(id, patch, actorId = '') {
    const before = this.task(id);
    if (!before) throw new AdapterError(`Task를 찾을 수 없습니다: ${id}`);
    const diff = describeDiff(before, patch, this);
    const row = await this.#update(TABLES.tasks, id, { ...patch, updated_at: nowIso() });
    if (diff) {
      await this.log({
        project_id: row.project_id, task_id: id, actor_id: actorId,
        event_type: 'TASK_UPDATED', message: diff,
      });
    }
    this.#emit();
    return row;
  }

  async deleteTask(id, actorId = '') {
    const task = this.task(id);
    if (!task) return;
    await Promise.all(this.assets(null, id).map((a) => this.#update(TABLES.assets, a.id, { task_id: '' })));
    await this.#remove(TABLES.tasks, id);
    await this.log({
      project_id: task.project_id, actor_id: actorId,
      event_type: 'TASK_DELETED', message: `${id} · ${task.title}`,
    });
    this.#emit();
  }

  // ------------------------------------------------------------------- Asset
  async createAsset(projectId, input, actorId = '') {
    const row = {
      id: uid('ast'),
      project_id: projectId,
      task_id: input.task_id || '',
      name: input.name?.trim() || 'untitled',
      path: input.path || '',
      drive_file_id: input.drive_file_id || '',
      drive_link: input.drive_link || '',
      current_version: 0,
      hash: '',
      lock_status: 'AVAILABLE',
      locked_by: '',
      locked_at: '',
      updated_at: nowIso(),
    };
    await this.#insert(TABLES.assets, row);
    await this.log({
      project_id: projectId, task_id: row.task_id, actor_id: actorId, source: 'drive',
      event_type: 'ASSET_CREATED', message: `${row.name} 등록`,
    });
    this.#emit();
    return row;
  }

  /** Exclusive Lock 획득. expect 조건으로 동시 체크아웃을 막는다. */
  async checkout(assetId, actorId) {
    const asset = this.asset(assetId);
    if (!asset) throw new AdapterError('에셋을 찾을 수 없습니다.');
    if (!actorId) throw new AdapterError('체크아웃하려면 현재 사용자를 선택하세요.');
    if (asset.lock_status === 'CHECKED_OUT') {
      throw new ConflictError(`이미 ${this.memberName(asset.locked_by)} 님이 체크아웃했습니다.`);
    }
    const row = await this.#update(TABLES.assets, assetId, {
      lock_status: 'CHECKED_OUT', locked_by: actorId, locked_at: nowIso(), updated_at: nowIso(),
    }, { expect: { lock_status: 'AVAILABLE' } });
    await this.log({
      project_id: asset.project_id, task_id: asset.task_id, actor_id: actorId, source: 'drive',
      event_type: 'ASSET_CHECKOUT', message: `${asset.name} 체크아웃`,
    });
    this.#emit();
    return row;
  }

  /** 락 강제 해제(버전 생성 없음). 강제 해제가 존재 이유이므로 의도적으로 CAS를 걸지 않는다. */
  async unlock(assetId, actorId) {
    const asset = this.asset(assetId);
    if (!asset) return null;
    const row = await this.#update(TABLES.assets, assetId, {
      lock_status: 'AVAILABLE', locked_by: '', locked_at: '', updated_at: nowIso(),
    });
    await this.log({
      project_id: asset.project_id, task_id: asset.task_id, actor_id: actorId, source: 'drive',
      event_type: 'ASSET_UNLOCK', message: `${asset.name} 락 해제`,
    });
    this.#emit();
    return row;
  }

  /**
   * 체크인: 해시 계산 → (가능하면) Drive 업로드 → 버전 생성 → current_version 증가 → 락 해제.
   * @param {File|null} file 실제 파일(선택). 없으면 메타데이터만으로 버전을 남긴다.
   */
  async checkin(assetId, { actorId, comment = '', file = null } = {}) {
    const asset = this.asset(assetId);
    if (!asset) throw new AdapterError('에셋을 찾을 수 없습니다.');
    if (asset.lock_status !== 'CHECKED_OUT') throw new ConflictError('체크아웃 상태의 에셋만 체크인할 수 있습니다.');

    let hash = asset.hash;
    let driveRevision = '';
    let driveFileId = asset.drive_file_id;
    let driveLink = asset.drive_link;

    if (file) {
      hash = await sha256(await file.arrayBuffer());
      if (typeof this.adapter.uploadAsset === 'function') {
        const up = await this.adapter.uploadAsset(file, { assetId, name: asset.name, comment });
        driveFileId = up.fileId || driveFileId;
        driveRevision = up.revisionId || '';
        driveLink = up.webViewLink || driveLink;
      }
    } else {
      hash = await sha256(`${assetId}:${Date.now()}`);
    }

    const versionNo = Number(asset.current_version || 0) + 1;
    const versionRow = {
      id: uid('ver'), asset_id: assetId, version_no: versionNo,
      drive_revision_id: driveRevision, author_id: actorId, hash,
      comment: comment || `v${versionNo} 체크인`, created_at: nowIso(),
    };
    await this.#insert(TABLES.assetVersions, versionRow);

    // 스냅샷이 낡았으면 이미 다른 사람이 락을 가져갔을 수 있다. expect로 스테일 체크인을 막는다.
    // locked_by는 넣지 않는다 — "다른 사람이 락 해제 → 내가 이어서 체크인"은 허용된 운용이다.
    let row;
    try {
      row = await this.#update(TABLES.assets, assetId, {
        current_version: versionNo, hash, drive_file_id: driveFileId, drive_link: driveLink,
        lock_status: 'AVAILABLE', locked_by: '', locked_at: '', updated_at: nowIso(),
      }, { expect: { lock_status: 'CHECKED_OUT' } });
    } catch (e) {
      if (e instanceof ConflictError) {
        // 버전 행만 남는 것을 막는다. 이 정리 자체가 실패해도 본 오류를 덮지 않는다.
        try { await this.#remove(TABLES.assetVersions, versionRow.id); } catch { /* noop */ }
        throw new ConflictError('이 에셋의 락 상태가 이미 변경되었습니다. 최신 상태를 확인한 뒤 다시 시도하세요.');
      }
      throw e;
    }
    await this.log({
      project_id: asset.project_id, task_id: asset.task_id, actor_id: actorId, source: 'drive',
      event_type: 'ASSET_CHECKIN', message: `${asset.name} v${versionNo} 체크인${comment ? ` · ${comment}` : ''}`,
    });
    this.#emit();
    return row;
  }

  async updateAsset(id, patch) { const r = await this.#update(TABLES.assets, id, { ...patch, updated_at: nowIso() }); this.#emit(); return r; }

  async deleteAsset(id, actorId = '') {
    const asset = this.asset(id);
    if (!asset) return;
    await Promise.all(this.versions(id).map((v) => this.#remove(TABLES.assetVersions, v.id)));
    await this.#remove(TABLES.assets, id);
    await this.log({
      project_id: asset.project_id, task_id: asset.task_id, actor_id: actorId, source: 'drive',
      event_type: 'ASSET_DELETED', message: `${asset.name} 삭제`,
    });
    this.#emit();
  }

  isBinary(asset) { return isBinaryAsset(asset?.name); }

  // --------------------------------------------------------------------- Git
  async addGitLink(projectId, input, actorId = '') {
    const row = {
      id: uid('git'),
      project_id: projectId,
      task_id: input.task_id || '',
      repository: input.repository || '',
      branch: input.branch || '',
      commit_sha: input.commit_sha || '',
      pull_request_no: input.pull_request_no || '',
      event_type: input.event_type || 'GIT_COMMIT',
      message: input.message || '',
      author: input.author || '',
      url: input.url || '',
      created_at: input.created_at || nowIso(),
    };
    await this.#insert(TABLES.gitLinks, row);
    await this.log({
      project_id: projectId, task_id: row.task_id, actor_id: actorId, source: 'git',
      event_type: row.event_type, message: gitMessage(row),
    });
    this.#emit();
    return row;
  }

  async removeGitLink(id) { await this.#remove(TABLES.gitLinks, id); this.#emit(); }

  /**
   * GitHub에서 가져온 이벤트를 Task 키로 매핑해 저장한다(중복은 건너뜀).
   * @returns {{linked:number, skipped:number, unmatched:number}}
   */
  async importGitEvents(projectId, events, { repository, actorId = '' } = {}) {
    const project = this.project(projectId);
    const keys = [project?.key].filter(Boolean);
    const existing = new Set(this.gitLinks(projectId).map(gitKeyOf));
    const known = new Set(this.tasks(projectId).map((t) => t.id));
    let linked = 0, skipped = 0, unmatched = 0;

    for (const ev of events) {
      const text = `${ev.message || ev.title || ''} ${ev.branch || ''}`;
      const taskIds = extractTaskKeys(text, keys).filter((k) => known.has(k));
      if (!taskIds.length) { unmatched++; continue; }

      for (const taskId of taskIds) {
        const draft = {
          task_id: taskId,
          repository,
          branch: ev.branch || '',
          commit_sha: ev.sha || '',
          pull_request_no: ev.number ? String(ev.number) : '',
          event_type: ev.type === 'pull_request' ? 'GIT_PR' : 'GIT_COMMIT',
          message: ev.message || ev.title || '',
          author: ev.author || '',
          url: ev.url || '',
          created_at: ev.date || nowIso(),
        };
        if (existing.has(gitKeyOf({ ...draft, project_id: projectId }))) { skipped++; continue; }
        await this.addGitLink(projectId, draft, actorId);
        existing.add(gitKeyOf({ ...draft, project_id: projectId }));
        linked++;

        // Task의 브랜치/PR 필드를 최신 정보로 채운다.
        const task = this.task(taskId);
        const patch = {};
        if (draft.branch && !task.git_branch) patch.git_branch = draft.branch;
        if (draft.pull_request_no && task.git_pr !== draft.pull_request_no) patch.git_pr = draft.pull_request_no;
        if (Object.keys(patch).length) await this.#update(TABLES.tasks, taskId, { ...patch, updated_at: nowIso() });
      }
    }
    this.#emit();
    return { linked, skipped, unmatched };
  }

  // ----------------------------------------------------------- 통합 Change Feed
  /** Task 변경 · Git 이벤트 · 에셋 버전을 시간순 단일 피드로 병합한다(계획서 13장 4단계). */
  feed({ projectId, sources, limit = 120 } = {}) {
    const want = (s) => !sources?.length || sources.includes(s);
    const items = [];

    if (want('hub') || want('drive')) {
      for (const l of this.logs({ projectId, limit: 400 })) {
        if (!want(l.source)) continue;
        items.push({
          id: l.id, at: l.created_at, source: l.source, event: l.event_type,
          text: l.message, actor: this.memberName(l.actor_id), taskId: l.task_id,
        });
      }
    }
    if (want('git')) {
      for (const g of this.gitLinks(projectId)) {
        items.push({
          id: g.id, at: g.created_at, source: 'git', event: g.event_type,
          text: gitMessage(g), actor: g.author || '-', taskId: g.task_id, url: g.url,
        });
      }
    }
    // items는 이미 소스별로 최신순이므로, 안정 정렬이 동일 시각의 순서를 보존한다.
    const seen = new Set();
    return items
      .sort(byDesc('at'))
      .filter((i) => (seen.has(i.id) ? false : seen.add(i.id)))
      .slice(0, limit);
  }

  // ----------------------------------------------------------- 내보내기/가져오기
  export() {
    return {
      version: 1,
      exported_at: nowIso(),
      columns: COLUMNS,
      data: clone(this.data),
    };
  }

  async import(payload, { merge = false } = {}) {
    const incoming = payload?.data ?? payload;
    if (!incoming || typeof incoming !== 'object') throw new AdapterError('올바른 백업 파일이 아닙니다.');
    // replaceAll은 #insert/#update/#remove를 거치지 않으므로 여기서 직접 쓰기 구간으로 표시한다.
    this.pending++;
    try {
      for (const table of TABLE_LIST) {
        const rows = Array.isArray(incoming[table]) ? incoming[table] : [];
        const next = merge ? mergeRows(this.data[table], rows) : rows;
        await this.adapter.replaceAll(table, next);
        this.data[table] = next;
      }
    } finally {
      this.pending--;
      this.writes++;
    }
    this.#emit();
  }

  async reset() {
    this.pending++;
    try {
      for (const table of TABLE_LIST) {
        await this.adapter.replaceAll(table, []);
        this.data[table] = [];
      }
    } finally {
      this.pending--;
      this.writes++;
    }
    this.#emit();
  }
}

// ------------------------------------------------------------------ 헬퍼
const gitKeyOf = (g) => `${g.project_id}|${g.task_id}|${g.commit_sha || `pr${g.pull_request_no}`}`;

function gitMessage(g) {
  if (g.event_type === 'GIT_PR') return `PR #${g.pull_request_no} ${g.message || ''}`.trim();
  if (g.commit_sha) return `${g.commit_sha.slice(0, 7)} ${g.message || ''}`.trim();
  return g.message || g.branch || 'Git 이벤트';
}

function mergeRows(current, incoming) {
  const map = new Map(current.map((r) => [r.id, r]));
  for (const r of incoming) map.set(r.id, r);
  return [...map.values()];
}

const FIELD_LABEL = {
  status: '상태', priority: '우선순위', assignee_id: '담당자', title: '제목',
  description: '설명', git_branch: '브랜치', git_pr: 'PR', feature_id: 'Feature',
};

/** 코드 값을 사람이 읽는 라벨로 바꾼다. */
const VALUE_LABEL = {
  status: (v) => statusMeta(v).label,
  priority: (v) => priorityMeta(v).label,
};

/** 변경 전/후를 사람이 읽는 한 줄로 요약한다. */
function describeDiff(before, patch, repo) {
  const parts = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'updated_at' || before[k] === v) continue;
    if (k === 'description') { parts.push('설명 수정'); continue; }
    const label = FIELD_LABEL[k] || k;
    const fmt = (val) => (k === 'assignee_id'
      ? repo.memberName(val)
      : (VALUE_LABEL[k]?.(val) ?? (val || '없음')));
    parts.push(`${label}: ${fmt(before[k])} → ${fmt(v)}`);
  }
  return parts.join(', ');
}

export { EVENTS, gitMessage };
