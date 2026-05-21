export type {
	DnsResolvedAddress,
	PinnedFetchDependencies,
	PinnedRequestOptions,
	ResolvePinnedAddressOptions,
} from "../../shared/pinned-fetch.ts";
export {
	createPinnedDispatcher,
	createPinnedLookup,
	fetchWithPinnedDns,
	resolveAndValidateAddresses,
} from "../../shared/pinned-fetch.ts";
