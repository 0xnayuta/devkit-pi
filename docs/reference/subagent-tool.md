---
status: current
audience: user
last_verified: 2026-05-08
---

# Subagent 工具 API

## 工具名

```text
subagent
```

## 参数

```ts
{
  agent: string;
  task: string;
}
```

## 示例

```ts
subagent({
  agent: "explorer",
  task: "Find where authentication middleware is implemented"
})
```

## 行为

- 每次调用只启动一个子代理
- foreground 同步执行
- 返回稳定结构化结果
- 不支持 `tasks`、`chain`、`parallel`、`background` 等高级参数
