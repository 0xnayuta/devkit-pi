import { Type } from "typebox";

export const FetchContentParams = Type.Object({
  url: Type.Optional(Type.String()),
  urls: Type.Optional(Type.Array(Type.String())),
});

export const WebSearchParams = Type.Object({
  query: Type.Optional(Type.String()),
  queries: Type.Optional(Type.Array(Type.String())),
  numResults: Type.Optional(Type.Number()),
  includeContent: Type.Optional(Type.Boolean()),
});

export const GetSearchContentParams = Type.Object({
  responseId: Type.String(),
  query: Type.Optional(Type.String()),
  queryIndex: Type.Optional(Type.Number()),
  url: Type.Optional(Type.String()),
  urlIndex: Type.Optional(Type.Number()),
});
