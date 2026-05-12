import { Type } from "typebox";

export const ConvertContentParams = Type.Object(
  {
    path: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    maxContentChars: Type.Optional(Type.Number()),
    timeoutMs: Type.Optional(Type.Number()),
  },
  { additionalProperties: false }
);
