export type ProjectStatus = 'active' | 'archived';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface ProjectSummary { id: string; name: string; description: string; updatedAt: string; status: ProjectStatus; shots: number; assets: number; progress: number; revision: number; state: string; maxBudgetCents: number; rightsConfirmed: boolean; }
export interface ProjectCreateInput { name: string; description: string; rightsConfirmed?: boolean; maxBudgetCents?: number; }
export interface ProjectSettings { playback?: 'hold' | 'stretch'; transition?: 'cut' | 'crossfade' | 'push' | 'wipe' | 'cover' | 'page-turn'; direction?: 'left' | 'right' | 'up' | 'down'; }
export interface Shot { id: string; title: string; scene: string; status: 'draft' | 'ready' | 'approved'; duration: string; prompt: string; }
export interface Asset { id: string; name: string; kind: 'image' | 'video' | 'audio'; meta: string; color: string; }

/** 风格分析里除「镜头节奏」外的一条结论。节奏不在这里 —— 它由 ReferenceSource.rhythm 推导。 */
export interface SourceFinding { key: string; label: string; value: string; score: number; }

/** 一条已读入的参考片 / 参考音频。 */
export interface ReferenceSource {
  id: string;
  name: string;
  kind: 'video' | 'audio';
  meta: string;
  /** 创作类型，对应落地页的四个入口 */
  genre: string;
  status: 'analyzed' | 'analyzing';
  /** 缩略块渐变的基色，沿用 Asset.color 的写法 */
  accent: string;
  /** 逐镜时长（秒）。风格分析的「镜头节奏」由它推导，不另存文案 */
  rhythm: number[];
  findings: SourceFinding[];
}
export interface GenerationJob { id: string; title: string; type: string; status: JobStatus; progress: number; createdAt: string; }
export interface AgentMessage { id: string; role: 'user' | 'agent'; content: string; createdAt: string; }

export interface ProjectPort {
  list(): Promise<ProjectSummary[]>;
  listArchived(): Promise<ProjectSummary[]>;
  get(id: string): Promise<ProjectSummary | undefined>;
  create(input: ProjectCreateInput): Promise<ProjectSummary>;
  rename(id: string, name: string): Promise<ProjectSummary>;
  trash(id: string): Promise<ProjectSummary>;
  restore(id: string): Promise<ProjectSummary>;
  purge(id: string, confirmName: string): Promise<void>;
  duplicate(id: string): Promise<ProjectSummary>;
  updateSettings(id: string, settings: ProjectSettings): Promise<ProjectSummary>;
}
export interface ShotPort { list(projectId: string): Promise<Shot[]>; }
export interface MediaPort { listAssets(projectId: string): Promise<Asset[]>; }
export interface SourcePort {
  list(projectId: string): Promise<ReferenceSource[]>;
  create(projectId: string, name: string, genre: string): Promise<ReferenceSource>;
}
export interface GenerationPort { listJobs(projectId: string): Promise<GenerationJob[]>; create(projectId: string, title: string, type: string): Promise<GenerationJob>; }
export interface AccountEntitlements { accountId: string; plan: 'free' | 'studio' | 'pro'; quotaCredits: number; watermark: boolean; subscriptionExpiresAt: string | null; entitlements: { max_duration_seconds: number; preview_quality: string; watermark: boolean; local_retakes: number; requires_payment_confirmation: boolean }; }
export interface CheckoutSession { provider: 'stripe' | 'local'; sessionId: string; url: string; }
export interface AccountPort { get(): Promise<AccountEntitlements>; consume(credits: number, reason: string): Promise<AccountEntitlements>; confirmPayment(plan: 'studio' | 'pro', amountCents: number): Promise<AccountEntitlements>; startCheckout(plan: 'studio' | 'pro', amountCents: number, returnUrl: string): Promise<CheckoutSession>; confirmStripePayment(sessionId: string): Promise<AccountEntitlements>; }
export interface AgentPort { listMessages(projectId: string): Promise<AgentMessage[]>; send(projectId: string, content: string): Promise<AgentMessage>; }
export interface AppPorts { account: AccountPort; projects: ProjectPort; shots: ShotPort; media: MediaPort; source: SourcePort; generation: GenerationPort; agent: AgentPort; }
