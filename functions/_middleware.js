export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // 🔒 lock only /coach (change if you want a different path)
  const PROTECTED_PREFIX = "/coach";

  if (!url.pathname.startsWith(PROTECTED_PREFIX)) {
    return next();
  }

  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Basic ")) {
    return new Response("Login required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="KY Golf Academy"' },
    });
  }

  const encoded = auth.slice("Basic ".length);
  const decoded = atob(encoded); // username:password
  const [user, pass] = decoded.split(":");

  if (user !== env.USERNAME || pass !== env.PASSWORD) {
    return new Response("Forbidden", { status: 403 });
  }

  return next();
}
