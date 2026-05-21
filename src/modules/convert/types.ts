import type { Static } from "typebox";
import type { ConvertErrorCode } from "./errors.ts";
import type { ConvertContentParams } from "./schemas.ts";

export type ConvertProviderName = "markitdown";

export type ConvertContentInput = Static<typeof ConvertContentParams>;

export interface ConvertContentMetadata {
	contentType?: string;
	fileName?: string;
	fileSize?: number;
	durationMs?: number;
}

export interface ConvertContentSuccess {
	source: string;
	provider: ConvertProviderName;
	content: string;
	truncated: boolean;
	metadata?: ConvertContentMetadata;
}

export interface ConvertContentError {
	error: {
		code: ConvertErrorCode;
		message: string;
	};
}

export type ConvertContentResult = ConvertContentSuccess | ConvertContentError;
