import type { ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export const LANGUAGE_IDS: Record<string, string> = {
  ".dart": "dart",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".vue": "vue",
  ".svelte": "svelte",
  ".astro": "astro",
  ".py": "python",
  ".pyi": "python",
  ".go": "go",
  ".rs": "rust",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".inc": "cpp",
};

export function findNearestFile(
  startDir: string,
  targets: string[],
  stopDir: string
): string | undefined {
  let current = path.resolve(startDir);
  const stop = path.resolve(stopDir);
  while (current.length >= stop.length) {
    for (const t of targets) {
      const candidate = path.join(current, t);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function findRoot(file: string, cwd: string, markers: string[]): string | undefined {
  const found = findNearestFile(path.dirname(file), markers, cwd);
  return found ? path.dirname(found) : undefined;
}

export function detectClangdCompilationDatabaseSetting(
  root: string
): { none: true } | { dir: string } | undefined {
  const configPath = path.join(root, ".clangd");
  if (!fs.existsSync(configPath)) return undefined;

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const match = content.match(/(?:^|\n)\s*CompilationDatabase\s*:\s*([^\n#]+)/i);
    if (!match) return undefined;

    const rawValue = match[1].trim().replace(/^['"]|['"]$/g, "");
    if (!rawValue) return undefined;
    if (rawValue.toLowerCase() === "none") return { none: true };

    const resolved = path.isAbsolute(rawValue) ? rawValue : path.resolve(root, rawValue);

    // clangd expects --compile-commands-dir to point to a directory.
    if (fs.existsSync(path.join(resolved, "compile_commands.json"))) return { dir: resolved };
    return undefined;
  } catch {
    return undefined;
  }
}

export function findCompileCommandsDir(root: string): string | undefined {
  if (fs.existsSync(path.join(root, "compile_commands.json"))) return root;

  const baseCandidates = [
    "build",
    "Build",
    "out",
    "Out",
    "cmake-build-debug",
    "cmake-build-release",
    "cmake-build-relwithdebinfo",
    "cmake-build-minsizerel",
  ];
  for (const base of baseCandidates) {
    const dir = path.join(root, base);
    if (fs.existsSync(path.join(dir, "compile_commands.json"))) return dir;
  }

  const oneLevelBases = ["build", "Build", "out", "Out"];
  const found: Array<{ dir: string; mtimeMs: number }> = [];

  for (const base of oneLevelBases) {
    const baseDir = path.join(root, base);
    if (!fs.existsSync(baseDir)) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(baseDir, e.name);
      const cdb = path.join(dir, "compile_commands.json");
      if (!fs.existsSync(cdb)) continue;

      try {
        const st = fs.statSync(cdb);
        found.push({ dir, mtimeMs: st.mtimeMs });
      } catch {
        found.push({ dir, mtimeMs: 0 });
      }
    }
  }

  if (!found.length) return undefined;
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found[0].dir;
}

const CPP_EXTENSIONS = [".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".hxx", ".inc"];

const CPP_ROOT_MARKERS = [
  "compile_commands.json",
  "CMakeLists.txt",
  "Makefile",
  "configure.ac",
  "configure.in",
  "meson.build",
  "BUILD.bazel",
  "BUILD",
  ".clang-format",
  ".git",
];

export function getCppCompilationDbHint(absPath: string, cwd: string): string | null {
  const ext = path.extname(absPath).toLowerCase();
  if (!CPP_EXTENSIONS.includes(ext)) return null;

  const root = findRoot(absPath, cwd, CPP_ROOT_MARKERS);
  if (!root) return null;
  if (findCompileCommandsDir(root)) return null;

  const suggestions: string[] = [];
  if (fs.existsSync(path.join(root, "CMakeLists.txt"))) {
    suggestions.push("  cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=1 -B build");
  }
  if (fs.existsSync(path.join(root, "Makefile"))) {
    suggestions.push("  bear -- make");
  }
  if (fs.existsSync(path.join(root, "meson.build"))) {
    suggestions.push("  meson setup build --backend=ninja");
  }
  if (suggestions.length === 0) {
    suggestions.push("  cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=1 -B build");
    suggestions.push("  bear -- make");
  }

  return [
    "⚠ No compile_commands.json found. clangd will use its built-in compiler with limited accuracy.",
    "To generate one:",
    ...suggestions,
    "Or create a .clangd config file with CompilationDatabase set.",
  ].join("\n");
}

export function findRootKotlin(file: string, cwd: string): string | undefined {
  const gradleRoot = findRoot(file, cwd, ["settings.gradle.kts", "settings.gradle"]);
  if (gradleRoot) return gradleRoot;

  return findRoot(file, cwd, [
    "build.gradle.kts",
    "build.gradle",
    "gradlew",
    "gradlew.bat",
    "gradle.properties",
    "pom.xml",
  ]);
}

function dirContainsNestedProjectFile(dir: string, dirSuffix: string, markerFile: string): boolean {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!e.name.endsWith(dirSuffix)) continue;
      if (fs.existsSync(path.join(dir, e.name, markerFile))) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function findRootSwift(file: string, cwd: string): string | undefined {
  let current = path.resolve(path.dirname(file));
  const stop = path.resolve(cwd);

  while (current.length >= stop.length) {
    if (fs.existsSync(path.join(current, "Package.swift"))) return current;

    if (dirContainsNestedProjectFile(current, ".xcodeproj", "project.pbxproj")) return current;
    if (dirContainsNestedProjectFile(current, ".xcworkspace", "contents.xcworkspacedata"))
      return current;

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return undefined;
}

export interface LSPServerConfig {
  id: string;
  extensions: string[];
  findRoot: (file: string, cwd: string) => string | undefined;
  spawn: (
    root: string
  ) => Promise<
    { process: ChildProcessWithoutNullStreams; initOptions?: Record<string, unknown> } | undefined
  >;
}

export interface LspServerRegistryDeps {
  which(cmd: string): string | undefined;
  spawnSimple(
    bin: string,
    args?: string[]
  ): (root: string) => Promise<{ process: ChildProcessWithoutNullStreams } | undefined>;
  spawnKotlinLanguageServer(root: string): Promise<ChildProcessWithoutNullStreams | undefined>;
  spawnSourcekitLsp(root: string): Promise<ChildProcessWithoutNullStreams | undefined>;
  spawnProcess(cmd: string, args: string[], cwd: string): ChildProcessWithoutNullStreams;
}

export function createLspServers(deps: LspServerRegistryDeps): LSPServerConfig[] {
  const { which, spawnSimple, spawnKotlinLanguageServer, spawnSourcekitLsp, spawnProcess } = deps;
  return [
    {
      id: "dart",
      extensions: [".dart"],
      findRoot: (f, cwd) => findRoot(f, cwd, ["pubspec.yaml", "analysis_options.yaml"]),
      spawn: async (root) => {
        let dart = which("dart");
        const pubspec = path.join(root, "pubspec.yaml");
        if (fs.existsSync(pubspec)) {
          try {
            const content = fs.readFileSync(pubspec, "utf-8");
            if (content.includes("flutter:") || content.includes("sdk: flutter")) {
              const flutter = which("flutter");
              if (flutter) {
                const dir = path.dirname(fs.realpathSync(flutter));
                for (const p of ["cache/dart-sdk/bin/dart", "../cache/dart-sdk/bin/dart"]) {
                  const c = path.join(dir, p);
                  if (fs.existsSync(c)) {
                    dart = c;
                    break;
                  }
                }
              }
            }
          } catch {}
        }
        if (!dart) return undefined;
        return {
          process: spawnProcess(dart, ["language-server", "--protocol=lsp"], root),
        };
      },
    },
    {
      id: "typescript",
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
      findRoot: (f, cwd) => {
        if (findNearestFile(path.dirname(f), ["deno.json", "deno.jsonc"], cwd)) return undefined;
        return findRoot(f, cwd, ["package.json", "tsconfig.json", "jsconfig.json"]);
      },
      spawn: async (root) => {
        const local = path.join(root, "node_modules/.bin/typescript-language-server");
        const cmd = fs.existsSync(local) ? local : which("typescript-language-server");
        if (!cmd) return undefined;
        return { process: spawnProcess(cmd, ["--stdio"], root) };
      },
    },
    {
      id: "vue",
      extensions: [".vue"],
      findRoot: (f, cwd) => findRoot(f, cwd, ["package.json", "vite.config.ts", "vite.config.js"]),
      spawn: spawnSimple("vue-language-server"),
    },
    {
      id: "svelte",
      extensions: [".svelte"],
      findRoot: (f, cwd) => findRoot(f, cwd, ["package.json", "svelte.config.js"]),
      spawn: spawnSimple("svelteserver"),
    },
    {
      id: "pyright",
      extensions: [".py", ".pyi"],
      findRoot: (f, cwd) =>
        findRoot(f, cwd, ["pyproject.toml", "setup.py", "requirements.txt", "pyrightconfig.json"]),
      spawn: spawnSimple("pyright-langserver"),
    },
    {
      id: "gopls",
      extensions: [".go"],
      findRoot: (f, cwd) => findRoot(f, cwd, ["go.work"]) || findRoot(f, cwd, ["go.mod"]),
      spawn: spawnSimple("gopls", []),
    },
    {
      id: "kotlin",
      extensions: [".kt", ".kts"],
      findRoot: (f, cwd) => findRootKotlin(f, cwd),
      spawn: async (root) => {
        const proc = await spawnKotlinLanguageServer(root);
        if (!proc) return undefined;
        return { process: proc };
      },
    },
    {
      id: "swift",
      extensions: [".swift"],
      findRoot: (f, cwd) => findRootSwift(f, cwd),
      spawn: async (root) => {
        const proc = await spawnSourcekitLsp(root);
        if (!proc) return undefined;
        return { process: proc };
      },
    },
    {
      id: "rust-analyzer",
      extensions: [".rs"],
      findRoot: (f, cwd) => findRoot(f, cwd, ["Cargo.toml"]),
      spawn: spawnSimple("rust-analyzer", []),
    },
    {
      id: "clangd",
      extensions: [".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hxx", ".inc"],
      findRoot: (f, cwd) =>
        findRoot(f, cwd, [
          "compile_commands.json",
          "CMakeLists.txt",
          "Makefile",
          "configure.ac",
          "configure.in",
          "meson.build",
          "BUILD.bazel",
          "BUILD",
          ".clang-format",
          ".git",
        ]),
      spawn: async (root) => {
        const clangd = which("clangd");
        if (!clangd) return undefined;

        const args = ["--clang-tidy", "--header-insertion=iwyu", "--background-index"];

        const explicitDb = detectClangdCompilationDatabaseSetting(root);
        if (explicitDb && "dir" in explicitDb) {
          args.push(`--compile-commands-dir=${explicitDb.dir}`);
        } else if (!explicitDb || !("none" in explicitDb)) {
          const autoDb = findCompileCommandsDir(root);
          if (autoDb) args.push(`--compile-commands-dir=${autoDb}`);
        }

        return { process: spawnProcess(clangd, args, root) };
      },
    },
  ];
}
