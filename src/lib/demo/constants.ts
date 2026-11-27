/** The read-only public demo account (spec §7, §10). */
export const DEMO_USER_ID = "demo-user";
export const DEMO_EMAIL = "demo@example.com";
export const DEMO_NAME = "Demo Athlete";
/**
 * The demo is shown in Japan time: the engine has local-time rules (e.g. after 12:00 the
 * "next workout" moves to tomorrow), so a fixed, documented zone keeps them predictable.
 */
export const DEMO_TIME_ZONE = "Asia/Tokyo";
