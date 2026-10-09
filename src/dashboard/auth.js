
const DISCORD_API = "https://discord.com/api/v10";

export function getDiscordLoginUrl(state) {
  const clientId = process.env.DISCORD_OAUTH_CLIENT_ID;
  const baseUrl = process.env.DASHBOARD_BASE_URL;

  if (!clientId || !baseUrl) {
    throw new Error("Discord OAuth environment variables are missing.");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/auth/discord/callback`,
    response_type: "code",
    scope: "identify guilds",
    state,
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCode(code) {
  const clientId = process.env.DISCORD_OAUTH_CLIENT_ID;
  const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET;
  const baseUrl = process.env.DASHBOARD_BASE_URL;

  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error("Discord OAuth environment variables are missing.");
  }

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${baseUrl}/auth/discord/callback`,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Discord OAuth error:", data);
    throw new Error("Discord OAuth token exchange failed.");
  }

  return data;
}
