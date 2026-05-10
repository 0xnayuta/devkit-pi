---
status: current
audience: maintainer
last_verified: 2026-05-08
---

# 发布前检查清单

## 代码验证

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm test:unit` 通过
- [ ] `pnpm test:mvp` 通过

## 文档同步

- [ ] `pnpm docs:check` 通过
- [ ] `README.md` 与 `agents/*.md` 的内置 agent 工具列表一致
- [ ] `docs/reference/agent-definition.md` 与 `agents/*.md` 的 frontmatter 一致
- [ ] `docs/reference/result-schema.md` 覆盖 `src/shared/types.ts` 中的所有 MVP 错误码
- [ ] `docs/reference/configuration.md` 与配置默认值一致
- [ ] 新增或恢复 MVP 外能力时，已新增 ADR

## 安全边界

- [ ] readonly agents 未暴露 `bash`、`edit`、`write`
- [ ] 子代理仍无法注册或调用 `subagent` 工具
- [ ] sanitize 规则覆盖 token、Authorization header、绝对路径和 stack trace

## 包元数据

- [ ] `package.json` 的 `files` 与实际发布内容一致
- [ ] `package.json` 的 `pi.extensions` 指向当前扩展入口
- [ ] `CHANGELOG.md` 已更新
