/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  /** EDUWAY API base, e.g. http://localhost:4100/api/v1 */
  readonly VITE_API_URL?: string;
  readonly VITE_DEFAULT_LANG?: 'ar' | 'en';
  /** Show the seeded demo-student hints on auth pages outside `vite dev` (staging). */
  readonly VITE_SHOW_DEMO_HINTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
