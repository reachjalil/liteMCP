/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly API_ORIGIN?: string;
  readonly LITEMCP_DEMO_MODE?: string;
  readonly PUBLIC_API_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
