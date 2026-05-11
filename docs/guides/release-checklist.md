---
status: current
audience: maintainer
last_verified: 2026-05-11
---

# 发布前检查清单

发布前应同步检查 [Documentation index](../README.md)、[Reference index](../reference/README.md)、[Configuration reference](../reference/configuration.md)、[Web tools error codes](../reference/web-tools-error-codes.md)、[Toolkit commands reference](../reference/toolkit-commands.md) 与 [CHANGELOG.md](../../CHANGELOG.md)。

## 代码验证

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm test` 通过
- [ ] `pnpm test:unit` 通过

## 文档同步

- [ ] `pnpm docs:check` 通过
- [ ] `README.md` / `README.zh.md` / `docs/README.md` / `docs/reference/README.md` 导航同步
- [ ] `README.md` 与 `agents/*.md` 的内置 agent 工具列表一致
- [ ] `docs/reference/agent-definition.md` 与 `agents/*.md` 的 frontmatter 一致
- [ ] `docs/reference/result-schema.md` 覆盖 `src/shared/types.ts` 中的所有 subagent 错误码
- [ ] `docs/reference/configuration.md` 与 namespace 配置默认值一致
- [ ] `docs/reference/web-tools-error-codes.md` 与 `src/modules/web/errors.ts` 的 `WEB_ERROR_CODES` 一致
- [ ] `/toolkit` 文档与 `src/modules/commands/register.ts` 真实 subcommands 一致
- [ ] 新增或恢复当前边界外能力时，已新增 ADR

## 安全边界

- [ ] readonly agents 未暴露 `bash`、`edit`、`write`
- [ ] 子代理仍无法注册或调用 `subagent` 工具
- [ ] 子代理仍无法调用 privileged LSP actions
- [ ] LSP hook 仅在主代理进程注册，且可通过配置关闭
- [ ] sanitize 规则覆盖 token、Authorization header、绝对路径和 stack trace

## 包元数据

- [ ] `package.json` 的 `files` 与实际发布内容一致
- [ ] `package.json` 的 `pi.extensions` 指向当前扩展入口
- [ ] `CHANGELOG.md` 已更新
