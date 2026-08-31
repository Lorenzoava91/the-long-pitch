function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequest({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) return new Response("GitHub OAuth non configurato", { status: 500 });
  const origin = new URL(request.url).origin;
  const state = randomState();
  const authorization = new URL("https://github.com/login/oauth/authorize");
  authorization.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorization.searchParams.set("redirect_uri", `${origin}/api/callback`);
  authorization.searchParams.set("scope", "repo,user");
  authorization.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorization.toString(),
      "Set-Cookie": `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "Cache-Control": "no-store"
    }
  });
}
