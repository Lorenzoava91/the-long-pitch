function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function responsePage(status, payload) {
  const message = JSON.stringify(`authorization:github:${status}:${JSON.stringify(payload)}`);
  return `<!doctype html><html><body><p>Accesso in corso…</p><script>
    (function () {
      var message = ${message};
      function receive(event) {
        if (event.source !== window.opener) return;
        window.opener.postMessage(message, event.origin);
        window.removeEventListener("message", receive);
      }
      window.addEventListener("message", receive);
      if (window.opener) window.opener.postMessage("authorizing:github", "*");
    }());
  </script></body></html>`;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getCookie(request, "oauth_state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return new Response("Richiesta OAuth non valida", { status: 400 });
  }
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/callback`
    })
  });
  const result = await tokenResponse.json();
  if (!tokenResponse.ok || result.error || !result.access_token) {
    return new Response(responsePage("error", result), {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  return new Response(responsePage("success", { token: result.access_token, provider: "github" }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": "oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    }
  });
}
