import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

const require = createRequire(import.meta.url);

const PI_PACKAGE_NAMES = new Set([
  "@earendil-works/pi-coding-agent",
  "@mariozechner/pi-coding-agent",
]);

function isPiPackageName(name: unknown): boolean {
  return typeof name === "string" && PI_PACKAGE_NAMES.has(name);
}

export function resolvePiPackageRoot(): string | undefined {
  try {
    const entry = process.argv[1];
    if (!entry) return undefined;
    let dir = path.dirname(fs.realpathSync(entry));
    while (dir !== path.dirname(dir)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
        if (isPiPackageName(pkg.name)) return dir;
      } catch {}
      dir = path.dirname(dir);
    }
  } catch {}
  return undefined;
}

export interface PiSpawnDeps {
  platform?: NodeJS.Platform;
  execPath?: string;
  argv1?: string;
  existsSync?: (filePath: string) => boolean;
  readFileSync?: (filePath: string, encoding: "utf-8") => string;
  resolvePackageJson?: () => string;
  piPackageRoot?: string;
}

interface PiSpawnCommand {
  command: string;
  args: string[];
}

function isRunnableNodeScript(
  filePath: string,
  existsSync: (filePath: string) => boolean
): boolean {
  if (!existsSync(filePath)) return false;
  return /\.(?:mjs|cjs|js)$/i.test(filePath);
}

function normalizePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

function findPiPackageJsonFrom(
  startDir: string,
  existsSync: (filePath: string) => boolean
): string | undefined {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    for (const packageName of PI_PACKAGE_NAMES) {
      const candidate = path.join(dir, "node_modules", ...packageName.split("/"), "package.json");
      if (existsSync(candidate)) return candidate;
    }
    dir = path.dirname(dir);
  }
  return undefined;
}

function defaultResolvePackageJson(existsSync: (filePath: string) => boolean): string {
  const root = resolvePiPackageRoot();
  if (root) return path.join(root, "package.json");

  const discovered = findPiPackageJsonFrom(process.cwd(), existsSync);
  if (discovered) return discovered;

  try {
    return require.resolve("@earendil-works/pi-coding-agent/package.json");
  } catch {
    return require.resolve("@mariozechner/pi-coding-agent/package.json");
  }
}

export function resolveWindowsPiCliScript(deps: PiSpawnDeps = {}): string | undefined {
  const existsSync = deps.existsSync ?? fs.existsSync;
  const readFileSync =
    deps.readFileSync ?? ((filePath, encoding) => fs.readFileSync(filePath, encoding));
  const argv1 = deps.argv1 ?? process.argv[1];

  if (argv1) {
    const argvPath = normalizePath(argv1);
    if (isRunnableNodeScript(argvPath, existsSync)) {
      return argvPath;
    }
  }

  try {
    const resolvePackageJson =
      deps.resolvePackageJson ??
      (() => {
        const root = deps.piPackageRoot ?? resolvePiPackageRoot();
        if (root) return path.join(root, "package.json");
        return defaultResolvePackageJson(existsSync);
      });
    const packageJsonPath = resolvePackageJson();
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      bin?: string | Record<string, string>;
    };
    const binField = packageJson.bin;
    const binPath =
      typeof binField === "string" ? binField : (binField?.pi ?? Object.values(binField ?? {})[0]);
    if (!binPath) return undefined;
    const candidate = normalizePath(path.resolve(path.dirname(packageJsonPath), binPath));
    if (isRunnableNodeScript(candidate, existsSync)) {
      return candidate;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getPiSpawnCommand(args: string[], deps: PiSpawnDeps = {}): PiSpawnCommand {
  const platform = deps.platform ?? process.platform;
  if (platform === "win32") {
    const piCliPath = resolveWindowsPiCliScript(deps);
    if (piCliPath) {
      return {
        command: deps.execPath ?? process.execPath,
        args: [piCliPath, ...args],
      };
    }
  }

  return { command: "pi", args };
}
