import { API_URL, adminCredentials } from './env';

/**
 * Minimal admin API client for FIXTURE data only (never for the interactions under test):
 * e.g. giving the demo student a fresh exam paper — the seeded papers have no attempts left.
 * Uses its own short-lived admin session (separate from the browser session under test).
 */
export class AdminApi {
  private token: string | null = null;
  private refresh: string | null = null;

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.token) await this.login();
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', 'X-Client-Platform': 'web', 'Accept-Language': 'en' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: unknown };
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json.error)}`);
    return json.data as T;
  }

  async login() {
    const { email, password } = adminCredentials();
    const res = await fetch(`${API_URL}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'web' },
      body: JSON.stringify({ email, password, remember: false }),
    });
    const json = (await res.json()) as { data: { tokens: { accessToken: string; refreshToken: string } } };
    if (!res.ok) throw new Error(`admin login ${res.status}`);
    this.token = json.data.tokens.accessToken;
    this.refresh = json.data.tokens.refreshToken;
  }

  async logout() {
    if (!this.refresh) return;
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refresh }),
    }).catch(() => undefined);
    this.token = this.refresh = null;
  }

  get = <T>(p: string) => this.call<T>('GET', p);
  post = <T>(p: string, b: unknown = {}) => this.call<T>('POST', p, b);
  put = <T>(p: string, b: unknown) => this.call<T>('PUT', p, b);
  patch = <T>(p: string, b: unknown) => this.call<T>('PATCH', p, b);
  del = <T>(p: string) => this.call<T>('DELETE', p);
}
