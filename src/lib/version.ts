// Bumped on each publish. Patch by default; say "bump minor/major" to change segment.
export const APP_VERSION = "1.0.2";
// Auto-stamped by vite.config.ts on every build — changes on every publish.
declare const __BUILD_ID__: string;
export const BUILD_ID: string = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
