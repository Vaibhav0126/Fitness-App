import { getAuth } from "@/lib/auth/server";

/** GET /demo → sign in as the read-only demo user and land on /app. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const res = await getAuth().api.demoSignIn({ headers: req.headers, asResponse: true });
    if (!res.ok) throw new Error(`demo sign-in failed: ${res.status}`);
    const redirect = new Response(null, {
      status: 303,
      headers: { Location: new URL("/app", url).toString() },
    });
    for (const cookie of res.headers.getSetCookie()) redirect.headers.append("Set-Cookie", cookie);
    return redirect;
  } catch (e) {
    console.error(e);
    return new Response(null, {
      status: 303,
      headers: { Location: new URL("/?demo=unavailable", url).toString() },
    });
  }
}
