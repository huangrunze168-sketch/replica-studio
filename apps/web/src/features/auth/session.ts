const SESSION_KEY = 'qiyin.session.v1';

/** 高保真原型的轻量登录态：真实接入账号系统时替换为服务端会话。 */
export function startSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SESSION_KEY, 'signed-in');
}

export function hasSession(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SESSION_KEY) === 'signed-in';
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

