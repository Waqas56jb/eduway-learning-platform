/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  /** API base incl. version, e.g. http://localhost:4100/api/v1 */
  readonly VITE_API_URL?: string;
  readonly VITE_DEFAULT_LANG?: 'en' | 'ar';
  /** Dev-only login helper (seeded super admin). Never set in production. */
  readonly VITE_DEMO_EMAIL?: string;
  readonly VITE_DEMO_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
