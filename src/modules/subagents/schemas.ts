/**
 * Minimal subagent tool schema
 * Only supports: agent + task
 */

import { Type } from "typebox";

export const SubagentParams = Type.Object(
  {
    agent: Type.String({
      minLength: 1,
      description: "Agent name: explorer, researcher, reviewer, implementer, or tester",
    }),
    task: Type.String({
      minLength: 1,
      description: "Task description for the subagent to execute",
    }),
  },
  { additionalProperties: false }
);
