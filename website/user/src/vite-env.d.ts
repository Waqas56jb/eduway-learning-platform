/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEFAULT_LANG?: 'ar' | 'en';
  readonly VITE_DEMO_OTP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
