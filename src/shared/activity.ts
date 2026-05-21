export type ToolkitActivityType = "search" | "fetch" | "get_content" | "convert";

export type ToolkitActivityStatus = "pending" | "success" | "error" | "rate_limited";

export interface ToolkitActivityEntry {
	timestamp: number;
	type: ToolkitActivityType;
	provider?: string;
	status: ToolkitActivityStatus;
	duration?: number;
	error?: string;
	requestId: string;
}

const MAX_ACTIVITY_ENTRIES = 100;
const activityLog: ToolkitActivityEntry[] = [];
let activityIndex = 0;

export function addToolkitActivityEntry(
	entry: Omit<ToolkitActivityEntry, "requestId"> & { requestId?: string }
): string {
	const requestId = entry.requestId ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const fullEntry: ToolkitActivityEntry = { ...entry, requestId };

	if (activityLog.length < MAX_ACTIVITY_ENTRIES) {
		activityLog.push(fullEntry);
	} else {
		activityLog[activityIndex] = fullEntry;
	}
	activityIndex = (activityIndex + 1) % MAX_ACTIVITY_ENTRIES;

	return requestId;
}

export function getToolkitActivityLog(limit?: number): ToolkitActivityEntry[] {
	if (activityLog.length === 0) return [];

	if (activityLog.length < MAX_ACTIVITY_ENTRIES) {
		const slice = limit ? activityLog.slice(-limit) : [...activityLog];
		return slice;
	}

	const ordered: ToolkitActivityEntry[] = [
		...activityLog.slice(activityIndex),
		...activityLog.slice(0, activityIndex),
	];

	return limit ? ordered.slice(-limit) : ordered;
}

export function clearToolkitActivityLog(): void {
	activityLog.length = 0;
	activityIndex = 0;
}
