export interface AbortRejectingFetchOptions {
	name?: string;
	message?: string;
}

export function createAbortRejectingFetch(
	options: AbortRejectingFetchOptions = {}
): (_input: string | URL | Request, init?: RequestInit) => Promise<Response> {
	const name = options.name ?? "AbortError";
	const message = options.message ?? "The operation was aborted";

	return async (_input: string | URL | Request, init?: RequestInit) => {
		return await new Promise<Response>((_resolve, reject) => {
			const signal = init?.signal;
			if (!signal) {
				reject(new Error("missing signal"));
				return;
			}

			if (signal.aborted) {
				reject(new DOMException(message, name));
				return;
			}

			signal.addEventListener(
				"abort",
				() => {
					reject(new DOMException(message, name));
				},
				{ once: true }
			);
		});
	};
}

export function createRedirectLoopFetch(status = 302): (_input: string | URL | Request) => Promise<Response> {
	return async (input: string | URL | Request) => {
		const url = String(input);
		return new Response(null, { status, headers: { location: `${url}?next=1` } });
	};
}
