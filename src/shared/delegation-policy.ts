/**
 * Delegation policy text for injecting into the parent agent's system prompt.
 *
 * Uses language-agnostic semantic descriptions + multilingual few-shot examples
 * to guide the model toward delegating focused tasks to specialized subagents.
 */

export const DELEGATION_POLICY = `
## Subagent Delegation Policy

When the user's request matches a subagent's specialty, prefer delegating:

- **explorer**: Locating, navigating, or searching code/files in the codebase
- **researcher**: Investigating external resources, comparing technologies, synthesizing information
- **reviewer**: Evaluating code quality, checking for issues, analyzing architecture
- **implementer**: Planning implementation, designing solutions, architecting features
- **tester**: Designing test strategies, identifying edge cases, planning coverage

Delegate when the task is focused and benefits from specialized tools.
Handle directly when the task is simple, requires immediate action, or is too small to benefit from delegation.
`.trim();

export const DELEGATION_EXAMPLES = `
## Delegation Examples

User: "Find where authentication is implemented"
→ Delegate to explorer

User: "帮我找一下认证模块在哪里"
→ Delegate to explorer

User: "Compare React and Vue for this project"
→ Delegate to researcher

User: "审查这段代码的安全性"
→ Delegate to reviewer

User: "How should I implement the payment flow?"
→ Delegate to implementer

User: "规划一下这个功能的测试方案"
→ Delegate to tester
`.trim();
