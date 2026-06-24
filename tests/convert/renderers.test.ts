import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { renderConvertContentCall, renderConvertContentResult } from "../../src/modules/convert/index.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

function textOf(value: any): string {
	return typeof value.text === "string" ? value.text : String(value);
}

describe("convert_content renderers", () => {
	it("renders calls for path and url inputs", () => {
		const pathCall = textOf(renderConvertContentCall({ path: "/tmp/document.pdf" }, theme));
		assert.match(pathCall, /convert_content/);
		assert.match(pathCall, /document\.pdf/);

		const urlCall = textOf(renderConvertContentCall({ url: "https://example.com/files/document.pdf" }, theme));
		assert.match(urlCall, /example\.com/);
	});

	it("renders compact success, expanded output, partial state, and errors", () => {
		const result: AgentToolResult<any> = {
			content: [{ type: "text", text: "" }],
			details: {
				source: "https://example.com/document.pdf",
				provider: "markitdown",
				content: "# Title\n\nConverted body",
				truncated: false,
				metadata: { contentType: "application/pdf", fileSize: 12 },
			},
		};

		const compact = textOf(renderConvertContentResult(result, { expanded: false, isPartial: false }, theme));
		assert.match(compact, /converted:/);
		assert.match(compact, /markitdown/);
		assert.match(compact, /Converted body/);

		const expanded = textOf(renderConvertContentResult(result, { expanded: true, isPartial: false }, theme));
		assert.match(expanded, /"provider": "markitdown"/);

		const partial = textOf(renderConvertContentResult(result, { expanded: false, isPartial: true }, theme));
		assert.match(partial, /Converting/);

		const error = textOf(
			renderConvertContentResult(
				{
					content: [{ type: "text", text: "" }],
					details: { error: { code: "CONVERT_FAILED", message: "boom" } },
				},
				{ expanded: false, isPartial: false },
				theme
			)
		);
		assert.match(error, /CONVERT_FAILED/);
		assert.match(error, /boom/);
	});
});
