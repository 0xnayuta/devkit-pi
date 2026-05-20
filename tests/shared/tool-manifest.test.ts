import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEVKIT_TOOL_MANIFEST,
  getDevkitToolMetadata,
  type DevkitToolMetadata,
} from "../../src/extension/manifest.ts";

describe("devkit tool manifest", () => {
  it("contains exactly the six public tools", () => {
    const names = DEVKIT_TOOL_MANIFEST.map((item) => item.name).sort();
    assert.deepEqual(names, [
      "convert_content",
      "fetch_content",
      "get_search_content",
      "lsp",
      "subagent",
      "web_search",
    ]);
  });

  it("keeps prompt metadata complete and non-empty", () => {
    for (const item of DEVKIT_TOOL_MANIFEST) {
      assert.equal(typeof item.label, "string");
      assert.ok(item.label.length > 0);
      assert.equal(typeof item.description, "string");
      assert.ok(item.description.length > 0);
      assert.equal(typeof item.promptSnippet, "string");
      assert.ok(item.promptSnippet.length > 0);
      assert.ok(Array.isArray(item.promptGuidelines));
      assert.ok(item.promptGuidelines.length > 0);
      for (const guideline of item.promptGuidelines) {
        assert.equal(typeof guideline, "string");
        assert.ok(guideline.length > 0);
      }
    }
  });

  it("returns stable metadata by tool name", () => {
    for (const item of DEVKIT_TOOL_MANIFEST) {
      const metadata = getDevkitToolMetadata(item.name);
      assert.deepEqual(metadata, item as DevkitToolMetadata);
    }
  });
});
