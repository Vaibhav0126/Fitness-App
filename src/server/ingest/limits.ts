import type { IngestLimits } from "./http";

/** Spec §4.1: 60 requests/hour per token, 14 days per request (enforced by the payload schema). */
export const SHORTCUT_LIMITS: IngestLimits = {
  name: "shortcut",
  perToken: { limit: 60, windowSeconds: 3600 },
  maxBytes: 64 * 1024,
};

/**
 * Health Auto Export's REST API automation can split one sync into several requests
 * ("Batch requests"), so the per-token limit is higher than the Shortcut's. 4 MB stays
 * under Vercel's 4.5 MB request body limit.
 */
export const HAE_LIMITS: IngestLimits = {
  name: "hae",
  perToken: { limit: 120, windowSeconds: 3600 },
  maxBytes: 4 * 1024 * 1024,
};
