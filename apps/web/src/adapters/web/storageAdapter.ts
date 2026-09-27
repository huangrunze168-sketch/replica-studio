import type { AppPorts, Asset, GenerationJob, GenerationPort, MediaPort, ProjectCreateInput, ProjectPort, ProjectSummary, ReferenceSource, Shot, ShotPort, SourcePort } from '../../ports/index.js';
import { memoryAdapter } from './memoryAdapter.js';

/**
 * localStorage 持久化适配器：包装 memoryAdapter，项目数据刷新不丢。
 * 首次运行从 memoryAdapter 播种演示数据，此后每次变更落盘 qiyin.projects.v1。
 * 存储配额满等异常静默降级为内存态，不影响交互。
 */
const STORAGE_KEY = 'qiyin.projects.v1';

let projects: ProjectSummary[] | null = null;

function readStore(): ProjectSummary[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as ProjectSummary[] | null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function hydrate(): Promise<ProjectSummary[]> {
  if (projects) return projects;
  const stored = readStore();
  if (stored) {
    projects = stored;
    return projects;
  }
  const [active, archived] = await Promise.all([memoryAdapter.projects.list(), memoryAdapter.projects.listArchived()]);
  projects = [...active, ...archived];
  persist();
  return projects;
}

function persist(): void {
  if (typeof window === 'undefined' || !projects) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    /* 降级为内存态 */
  }
}

const SHOTS_KEY = 'qiyin.shots.v1';
let shotsStore: Record<string, Shot[]> | null = null;

function readShots(): Record<string, Shot[]> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SHOTS_KEY) ?? 'null') as Record<string, Shot[]> | null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistShots(): void {
  if (typeof window === 'undefined' || !shotsStore) return;
  try {
    window.localStorage.setItem(SHOTS_KEY, JSON.stringify(shotsStore));
  } catch {
    /* 降级为内存态 */
  }
}

/** 按项目确定性生成分镜种子：同一项目永远同一组，避免所有项目共用演示镜头。 */
async function seedShots(projectId: string): Promise<Shot[]> {
  if (projectId === 'p-demo') return memoryAdapter.shots.list(projectId);
  let hash = 0;
  for (let i = 0; i < projectId.length; i += 1) hash = (hash * 31 + projectId.charCodeAt(i)) >>> 0;
  const rand = (n: number) => ((hash >> ((n % 8) * 3)) % 100) / 100;
  const scenes = ['外景 / 城市街头', '内景 / 工作室', '外景 / 自然光', '内景 / 走廊', '外景 / 黄昏天台'];
  const statuses = ['draft', 'ready', 'approved'] as const;
  const count = 3 + Math.round(rand(1) * 3);
  const list = Array.from({ length: count }, (_, i) => ({
    id: projectId + '-s' + (i + 1),
    title: '0' + (i + 1) + ' · 镜头 ' + (i + 1),
    scene: scenes[(i + Math.floor(rand(i + 2) * 5)) % scenes.length],
    status: statuses[(i + Math.floor(rand(i + 3) * 3)) % statuses.length],
    duration: '00:0' + (1 + (i % 6)),
    prompt: '由项目方向生成的初始分镜提示词，可在分镜面板细化。',
  }));
  return list as Shot[];
}

const shotPort: ShotPort = {
  list: async projectId => {
    if (!shotsStore) shotsStore = readShots();
    if (!shotsStore[projectId]) {
      shotsStore[projectId] = await seedShots(projectId);
      persistShots();
    }
    return shotsStore[projectId];
  },
};

const projectPort: ProjectPort = {
  list: async () => (await hydrate()).filter(project => project.status === 'active'),
  listArchived: async () => (await hydrate()).filter(project => project.status === 'archived'),
  get: async id => (await hydrate()).find(project => project.id === id),
  create: async (input: ProjectCreateInput) => {
    const created = await memoryAdapter.projects.create(input);
    (await hydrate()).unshift(created);
    persist();
    return created;
  },
  rename: async (id, name) => {
    const project = (await hydrate()).find(item => item.id === id);
    if (!project) throw new Error('项目不存在');
    project.name = name.trim();
    project.updatedAt = '刚刚';
    project.revision += 1;
    persist();
    return project;
  },
  trash: async id => {
    const project = (await hydrate()).find(item => item.id === id);
    if (!project) throw new Error('项目不存在');
    project.status = 'archived';
    project.state = 'ARCHIVED';
    project.updatedAt = '刚刚';
    project.revision += 1;
    persist();
    return project;
  },
  restore: async id => {
    const project = (await hydrate()).find(item => item.id === id);
    if (!project) throw new Error('项目不存在');
    project.status = 'active';
    project.state = 'PRODUCTION';
    project.updatedAt = '刚刚';
    project.revision += 1;
    persist();
    return project;
  },
  purge: async id => {
    const all = await hydrate();
    const index = all.findIndex(item => item.id === id);
    if (index >= 0) all.splice(index, 1);
    persist();
  },
  duplicate: async id => {
    const source = (await hydrate()).find(item => item.id === id);
    if (!source) throw new Error('项目不存在');
    const copy: ProjectSummary = { ...source, id: 'p-' + Date.now(), name: source.name + ' · 副本', updatedAt: '刚刚', status: 'active', state: 'EMPTY', shots: 0, assets: 0, progress: 0, revision: 1, rightsConfirmed: false };
    (await hydrate()).unshift(copy);
    persist();
    return copy;
  },
  updateSettings: async id => {
    const project = (await hydrate()).find(item => item.id === id);
    if (!project) throw new Error('项目不存在');
    project.updatedAt = '刚刚';
    project.revision += 1;
    persist();
    return project;
  },
};

/* ---- assets / sources / jobs：与 shots 同款的按项目键控持久化 ---- */
const ASSETS_KEY = 'qiyin.assets.v1';
const SOURCES_KEY = 'qiyin.sources.v1';
const JOBS_KEY = 'qiyin.jobs.v1';
let assetsStore: Record<string, Asset[]> | null = null;
let sourcesStore: Record<string, ReferenceSource[]> | null = null;
let jobsStore: Record<string, GenerationJob[]> | null = null;

function readBuckets<T>(key: string): Record<string, T[]> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null') as Record<string, T[]> | null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeBuckets<T>(key: string, store: Record<string, T[]>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(store));
  } catch {
    /* 降级为内存态 */
  }
}

function hashOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function seedAssets(projectId: string): Asset[] {
  const rand = (n: number) => ((hashOf(projectId) >> ((n % 8) * 3)) % 100) / 100;
  const kinds: Array<Asset['kind']> = ['image', 'audio', 'video'];
  const colors = ['#245c70', '#7c4d3b', '#53439a', '#325d42'];
  const names = ['参考帧序列', '角色一致性套图', '氛围音轨', '运镜测试片段'];
  const count = 2 + Math.round(rand(1) * 3);
  const list = Array.from({ length: count }, (_, i) => ({
    id: projectId + '-a' + (i + 1),
    name: names[i % names.length],
    kind: kinds[(i + Math.floor(rand(i + 2) * 3)) % 3],
    meta: kinds[(i + 1) % 3] === 'audio' ? '00:' + (10 + i * 7) + ' · WAV' : '1920 × 1080 · ' + (kinds[(i + 1) % 3] === 'video' ? 'MP4' : 'JPG'),
    color: colors[(i + Math.floor(rand(i + 4) * 4)) % 4],
  }));
  return list as Asset[];
}

function seedSources(projectId: string): ReferenceSource[] {
  const rand = (n: number) => ((hashOf(projectId + ':src') >> ((n % 8) * 3)) % 100) / 100;
  const genres = ['知识类口播', '产品广告', '情绪化剧情片', '系列内容'];
  const accents = ['#2f5d6b', '#7c4d3b', '#245c70', '#3f5a3a'];
  const genreIndex = Math.floor(rand(1) * genres.length);
  const rhythm = Array.from({ length: 4 + Math.floor(rand(2) * 4) }, (_, i) => Math.round((1.5 + rand(i + 3) * 2.5) * 10) / 10);
  const findings = [
    { key: 'shotScale', label: '景别结构', value: '中景为主', score: 30 + Math.round(rand(4) * 60) },
    { key: 'composition', label: '构图倾向', value: rand(5) > 0.5 ? '三分法 · 高对比' : '中心构图 + 留白', score: 30 + Math.round(rand(6) * 60) },
    { key: 'emotion', label: '情绪曲线', value: '低位起 · 中段抬升', score: 30 + Math.round(rand(7) * 60) },
  ];
  const list = [{
    id: projectId + '-r1',
    name: '首轮参考 · 自动读入',
    kind: 'video' as const,
    meta: '刚刚读入 · 规格待补',
    genre: genres[genreIndex],
    status: 'analyzed' as const,
    accent: accents[genreIndex],
    rhythm,
    findings,
  }];
  return list as ReferenceSource[];
}

function seedJobs(projectId: string): GenerationJob[] {
  const rand = (n: number) => ((hashOf(projectId + ':job') >> ((n % 8) * 3)) % 100) / 100;
  const list: GenerationJob[] = [
    { id: projectId + '-j1', title: '首镜 · 候选首帧', type: '图像生成', status: 'succeeded', progress: 100, createdAt: '昨天' },
  ];
  if (rand(1) > 0.4) {
    list.push({ id: projectId + '-j2', title: '次镜 · 图生视频', type: '图生视频', status: 'running', progress: 20 + Math.round(rand(2) * 60), createdAt: '2 分钟前' });
  }
  return list;
}

const mediaPort: MediaPort = {
  listAssets: async projectId => {
    if (!assetsStore) assetsStore = readBuckets(ASSETS_KEY);
    if (!assetsStore[projectId]) {
      assetsStore[projectId] = projectId === 'p-demo' ? await memoryAdapter.media.listAssets(projectId) : seedAssets(projectId);
      writeBuckets(ASSETS_KEY, assetsStore);
    }
    return assetsStore[projectId];
  },
};

const sourcePort: SourcePort = {
  list: async projectId => {
    if (!sourcesStore) sourcesStore = readBuckets(SOURCES_KEY);
    if (!sourcesStore[projectId]) {
      sourcesStore[projectId] = projectId === 'p-demo' ? await memoryAdapter.source.list(projectId) : seedSources(projectId);
      writeBuckets(SOURCES_KEY, sourcesStore);
    }
    return sourcesStore[projectId];
  },
  create: async (projectId, name, genre) => {
    if (!sourcesStore) sourcesStore = readBuckets(SOURCES_KEY);
    if (!sourcesStore[projectId]) sourcesStore[projectId] = await seedSources(projectId);
    const created = await memoryAdapter.source.create(projectId, name, genre);
    sourcesStore[projectId] = [created, ...sourcesStore[projectId]];
    writeBuckets(SOURCES_KEY, sourcesStore);
    return created;
  },
};

const generationPort: GenerationPort = {
  listJobs: async projectId => {
    if (!jobsStore) jobsStore = readBuckets(JOBS_KEY);
    if (!jobsStore[projectId]) {
      jobsStore[projectId] = projectId === 'p-demo' ? await memoryAdapter.generation.listJobs(projectId) : seedJobs(projectId);
      writeBuckets(JOBS_KEY, jobsStore);
    }
    return jobsStore[projectId];
  },
  create: async (projectId, title, type) => {
    if (!jobsStore) jobsStore = readBuckets(JOBS_KEY);
    if (!jobsStore[projectId]) jobsStore[projectId] = await seedJobs(projectId);
    const job: GenerationJob = { id: projectId + '-j-' + Date.now(), title, type, status: 'queued', progress: 0, createdAt: '刚刚' };
    jobsStore[projectId] = [job, ...jobsStore[projectId]];
    writeBuckets(JOBS_KEY, jobsStore);
    return job;
  },
};

export const storageAdapter: AppPorts = {
  ...memoryAdapter,
  projects: projectPort,
  shots: shotPort,
  media: mediaPort,
  source: sourcePort,
  generation: generationPort,
};
