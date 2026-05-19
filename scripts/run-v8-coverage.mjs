import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const coverageDir = path.join(repoRoot, ".coverage");
const v8Dir = path.join(coverageDir, "v8");

async function main() {
  await rm(v8Dir, { recursive: true, force: true });
  await mkdir(v8Dir, { recursive: true });

  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    throw new Error("npm_execpath is missing; please run this script via pnpm");
  }

  const cmd = process.execPath;
  const args = [npmExecPath, "test:unit"];

  const child = spawn(cmd, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_V8_COVERAGE: v8Dir,
    },
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error("[coverage] failed to start test process:", error);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`[coverage] test process terminated by signal: ${signal}`);
      process.exit(1);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error("[coverage] unexpected error:", error);
  process.exit(1);
});
