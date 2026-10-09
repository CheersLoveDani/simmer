/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Override the recipe feed base URL (must end in the version folder, e.g. `.../v1/`). */
  readonly VITE_FEED_URL?: string;
}
