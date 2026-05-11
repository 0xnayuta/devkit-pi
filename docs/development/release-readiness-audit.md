---
status: current
audience: maintainer
last_verified: 2026-05-11
---

# Release readiness audit

## Audit date

2026-05-11

## Scope

- Package metadata and publish allowlist: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.
- Runtime entry points: `index.ts`, `src/index.ts`, `src/modules/`, `agents/`.
- Documentation and release notes: `README.md`, `README.zh.md`, `CHANGELOG.md`, `docs/`.
- Validation and CI/deploy configuration: `scripts/check-docs.mjs`, `tsconfig.json`, `.github/workflows/`.
- Local validation: docs build/check, unit tests, npm package dry run.

## package.json publish configuration

- Package name `devkit-pi` matches the current project identity and pi package positioning.
- Version is `0.1.0`. Confirmed available on npm (404 Not Found for `devkit-pi`); suitable for first publish.
- Metadata is present: description, author, license, repository, homepage, bugs, keywords, package manager.
- Package type is ESM via `"type": "module"`.
- The package is configured as a pi package via `pi.extensions: ["./index.ts"]`.
- No `publishConfig` is set.
- No `bin` is set, which is expected because this package is a pi extension package rather than a CLI.
- `files` was tightened to publish runtime TypeScript source, built-in agents, README files, changelog, license, and Markdown docs without publishing VitePress build output.

## Build artifacts and entry points

- There is currently no `build` script.
- `tsconfig.json` has `noEmit: true`; `dist/` is documented as an output directory but is not currently produced by project scripts.
- Runtime loading is source-based:
  - root `index.ts` re-exports the default extension from `src/index.ts`.
  - `package.json` points pi to `./index.ts` through `pi.extensions`.
- No `main`, `types`, or `exports` fields are defined. This is acceptable for the current pi package source-loading model, but should be revisited if the package is later intended to be consumed as a normal Node library.
- `pnpm pack` does not require a build step under the current source-published design.

## Pack dry run summary

Command used:

```bash
pnpm pack --dry-run
npm pack --dry-run --json
```

Result after tightening `files`:

- Tarball: `devkit-pi-0.1.0.tgz`
- File count: 100
- Packed size: 201,856 bytes
- Unpacked size: 717,533 bytes
- Includes runtime entry and source files: `index.ts`, `src/**/*.ts`.
- Includes built-in agents: `agents/*.md`.
- Includes package metadata and docs entry files: `README.md`, `README.zh.md`, `CHANGELOG.md`, `LICENSE`, `docs/**/*.md`.
- Does not include `.github/`, `tests/`, `node_modules/`, `docs/.vitepress/dist/`, or other VitePress build artifacts.

## README, docs, and changelog status

- `README.md` includes project overview, install path, quick start, module overview, documentation site link, and experimental writable subagent boundary.
- `README.zh.md` mirrors the English README information hierarchy.
- `CHANGELOG.md` has an `Unreleased` documentation section for the VitePress documentation site rollout.
- Documentation site URL is `https://devkit-pi.wangyan.life/`.
- `docs/reference/` remains the canonical current public contract / API reference source.

## GitHub Actions status

- Docs workflow: `.github/workflows/docs.yml`.
  - Installs with `pnpm install --frozen-lockfile`.
  - Runs `pnpm docs:check` and `pnpm docs:build`.
  - Uploads `docs/.vitepress/dist` to GitHub Pages.
  - Does not perform release or npm publish actions.
- CI workflow: `.github/workflows/ci.yml`.
  - Triggers on `push` to `main` and `pull_request`.
  - Runs `pnpm docs:check`, `pnpm test`, `pnpm docs:build`.
  - Does not perform release, npm publish, or GitHub Pages deployment.

## Local validation results

- `pnpm docs:build`: passed.
- `pnpm docs:check`: passed.
- `pnpm test`: passed, 583 tests passed.
- `pnpm build`: not available; no `build` script is currently defined.

## Release blockers

- No local packaging blocker remains after tightening `package.json.files`.
- Conditional blocker before npm publish: verify that `devkit-pi@0.1.0` is not already published, or bump `version` before publishing.

## prepublishOnly

Added to `package.json`:

```json
"prepublishOnly": "pnpm docs:check && pnpm test"
```

Rationale:
- `pnpm docs:check` enforces documentation structural rules before publish.
- `pnpm test` enforces unit test pass before publish.
- `docs:build` is not included: documentation site build is not strongly coupled with npm package publishing.
- `pack --dry-run` is not included: it is a packaging validation step, not a gate condition.
- `build` is not included: there is no build script and the package uses TypeScript source publishing.

## Non-blocking recommendations

- Revisit `main` / `types` / `exports` only if devkit-pi becomes a normal importable Node package in addition to a pi extension package.
- Consider whether full Markdown docs should remain in the npm tarball long term; current packaging intentionally includes them for reference availability.
- Consider adding `typecheck` to CI workflow later if desired.

## Round 4B: npm name/version confirmation and publish prep

### npm package name availability

- `npm view devkit-pi version` returned 404 Not Found.
- `npm view devkit-pi versions --json` returned 404 Not Found.
- Registry confirmed as `https://registry.npmjs.org/`.
- Conclusion: `devkit-pi` package name is not yet published on npm. Current `0.1.0` is available for first publish.

### npm authentication status

- `npm whoami` returned 401 Unauthorized.
- No npm token is configured in this environment.
- Manual `npm login` is required before publishing.

### Pack dry run result

- `npm pack --dry-run --json`: `devkit-pi-0.1.0.tgz`, 100 files, ~202KB packed, ~718KB unpacked.
- No unwanted paths included.

## Next steps

1. Commit audit update, prepublishOnly addition, and CI workflow.
2. Push to `origin/main`.
3. Confirm CI workflow runs green on GitHub.
4. Run `npm login` before publishing.
5. Publish only after confirming npm version availability and release intent.
