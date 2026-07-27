/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUILD_COMMIT_SHA: string;
  readonly VITE_BUILD_DATE: string;
  readonly VITE_BUILD_ENVIRONMENT: string;
  readonly VITE_SUPABASE_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
