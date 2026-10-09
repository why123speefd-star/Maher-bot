
const DISCORD_API = "https://discord.com/api/v10";

export async function discordRequest(endpoint, accessToken) {
  const response = await fetch(`${DISCORD_API}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Discord API error: ${response.status}`);
  }

  return response.json();
}

export function canManageGuild(guild) {
  const permissions = BigInt(guild.permissions ?? "0");

  const ADMINISTRATOR = 0x8n;
  const MANAGE_GUILD = 0x20n;

  return (
    (permissions & ADMINISTRATOR) === ADMINISTRATOR ||
    (permissions & MANAGE_GUILD) === MANAGE_GUILD
  );
}

export async function getManageableGuilds(accessToken) {
  const guilds = await discordRequest(
    "/users/@me/guilds",
    accessToken
  );

  return guilds.filter(canManageGuild);
}
