/**
 * Root entry point for pi extension loading.
 * Re-exports from src/index.ts so the display name shows as "devkit-pi"
 * instead of "src" (pi derives the label from the entry point path).
 */
export { default } from "./src/index.ts";
