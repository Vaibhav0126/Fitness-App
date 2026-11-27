import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/server";

const handler = (_req: Request) => toNextJsHandler(getAuth());

export const GET = (req: Request) => handler(req).GET(req);
export const POST = (req: Request) => handler(req).POST(req);
