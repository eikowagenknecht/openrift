// Runtime feature flags injected by docker-entrypoint.sh via /config.js.
// In development, /config.js may not exist — flags default to false.

type FeatureFlags = Record<string, boolean>;

declare global {
  interface Window {
    __FEATURE_FLAGS__?: FeatureFlags;
  }
}

export function featureEnabled(flag: string): boolean {
  // oxlint-disable-next-line eslint-plugin-unicorn(prefer-global-this) -- Window augmentation requires window access
  return window.__FEATURE_FLAGS__?.[flag] === true;
}
