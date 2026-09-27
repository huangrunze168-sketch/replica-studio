const SESSION_KEY = 'qiyin.session.v2';
const LEGACY_KEY = 'qiyin.session.v1';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 天滑动过期

/** 高保真原型的轻量登录态：真实接入账号系统时替换为服务端会话。 */
export interface StoredSession {
  email: string;
  signedInAt: number;
  plan: 'free';
}

function parseStored(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.email !== 'string' || typeof parsed.signedInAt !== 'number') return null;
    if (Date.now() - parsed.signedInAt > MAX_AGE_MS) return null;
    return { email: parsed.email, signedInAt: parsed.signedInAt, plan: 'free' };
  } catch {
    return null;
  }
}

export function startSession(email: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ email, signedInAt: Date.now(), plan: 'free' } satisfies StoredSession),
  );
  window.localStorage.removeItem(LEGACY_KEY);
}

/** 读取会话；旧版 'signed-in' 字符串标记自动迁移到 v2。 */
export function readSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  const stored = parseStored(window.localStorage.getItem(SESSION_KEY));
  if (stored) return stored;
  if (window.localStorage.getItem(LEGACY_KEY) === 'signed-in') {
    const migrated: StoredSession = { email: '', signedInAt: Date.now(), plan: 'free' };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(migrated));
    window.localStorage.removeItem(LEGACY_KEY);
    return migrated;
  }
  return null;
}

export function hasSession(): boolean {
  return readSession() !== null;
}

export function endSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(LEGACY_KEY);
}

export function resolveSignupRedirect(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/create';
  const root = next.split('/').filter(Boolean)[0] ?? '';
  if (!['create', 'workbench'].includes(root)) return '/create';
  return next;
}

export function readSignupRedirect(): string {
  if (typeof window === 'undefined') return '/create';
  return resolveSignupRedirect(new URLSearchParams(window.location.search).get('next'));
}
