
export const FEATURES = {
  welcome: {
    label: "Welcome Messages",
    description: "Configure welcome messages for new members."
  },
  logging: {
    label: "Server Logging",
    description: "Enable server event and moderation logs."
  },
  automod: {
    label: "Auto Moderation",
    description: "Enable supported automatic moderation rules."
  },
  antiRaid: {
    label: "Anti-Raid",
    description: "Enable supported raid protection."
  },
  antiNuke: {
    label: "Anti-Nuke",
    description: "Enable supported destructive-action protection."
  },
  tickets: {
    label: "Tickets",
    description: "Enable the ticket system."
  },
  leveling: {
    label: "Leveling",
    description: "Enable XP and leveling features."
  }
};

export async function getGuildSettings(pool, guildId) {
  const result = await pool.query(
    `SELECT settings
     FROM guild_dashboard_settings
     WHERE guild_id = $1`,
    [guildId]
  );

  const saved = result.rows[0]?.settings ?? {};

  return Object.fromEntries(
    Object.keys(FEATURES).map(key => [key, saved[key] === true])
  );
}

export async function updateGuildSetting(
  pool,
  guildId,
  userId,
  feature,
  enabled
) {
  if (!Object.hasOwn(FEATURES, feature)) {
    throw new Error("Unknown feature.");
  }

  if (typeof enabled !== "boolean") {
    throw new Error("enabled must be true or false.");
  }

  await pool.query(
    `INSERT INTO guild_dashboard_settings
      (guild_id, settings, updated_by, updated_at)
     VALUES ($1, jsonb_build_object($2::text, $3::boolean), $4, NOW())
     ON CONFLICT (guild_id)
     DO UPDATE SET
       settings = guild_dashboard_settings.settings ||
         jsonb_build_object($2::text, $3::boolean),
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [guildId, feature, enabled, userId]
  );

  return { feature, enabled };
}

export async function isFeatureEnabled(pool, guildId, feature) {
  if (!Object.hasOwn(FEATURES, feature)) {
    return false;
  }

  const settings = await getGuildSettings(pool, guildId);
  return settings[feature] === true;
}
