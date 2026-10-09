
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getManageableGuilds } from "../discord.js";
import {
  FEATURES,
  getGuildSettings,
  updateGuildSetting
} from "../settings.js";
import { randomBytes, timingSafeEqual } from "node:crypto";

function equalToken(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const x = Buffer.from(a);
  const y = Buffer.from(b);

  return x.length === y.length && timingSafeEqual(x, y);
}

export default function createSettingsRouter({ pool, client }) {
  const router = Router();

  // The browser requests this token before making changes.
  router.get("/csrf", requireAuth, (req, res) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = randomBytes(32).toString("hex");
    }

    res.json({ csrfToken: req.session.csrfToken });
  });

  async function canAccessGuild(req, guildId) {
    if (!/^\d{17,20}$/.test(guildId)) return false;

    const guilds = await getManageableGuilds(
      req.session.discordAccessToken
    );

    return guilds.some(guild => guild.id === guildId);
  }

  router.get("/:guildId", requireAuth, async (req, res, next) => {
    try {
      const { guildId } = req.params;

      if (!(await canAccessGuild(req, guildId))) {
        return res.status(403).json({
          error: "You cannot manage this server."
        });
      }

      const guild = await client.guilds.fetch(guildId).catch(() => null);

      if (!guild) {
        return res.status(409).json({
          error: "Invite MaherBot to this server first."
        });
      }

      res.json({
        guild: {
          id: guild.id,
          name: guild.name
        },
        features: FEATURES,
        settings: await getGuildSettings(pool, guildId)
      });
    } catch (error) {
      next(error);
    }
  });

  router.put(
    "/:guildId/:feature",
    requireAuth,
    async (req, res, next) => {
      try {
        const { guildId, feature } = req.params;
        const { enabled } = req.body;

        if (!equalToken(
          req.get("x-csrf-token"),
          req.session.csrfToken
        )) {
          return res.status(403).json({
            error: "Invalid CSRF token. Refresh the page and try again."
          });
        }

        if (!Object.hasOwn(FEATURES, feature)) {
          return res.status(400).json({
            error: "Unknown feature."
          });
        }

        if (typeof enabled !== "boolean") {
          return res.status(400).json({
            error: "enabled must be true or false."
          });
        }

        if (!(await canAccessGuild(req, guildId))) {
          return res.status(403).json({
            error: "You cannot manage this server."
          });
        }

        const guild = await client.guilds.fetch(guildId).catch(() => null);

        if (!guild) {
          return res.status(409).json({
            error: "MaherBot is not in this server."
          });
        }

        const result = await updateGuildSetting(
          pool,
          guildId,
          req.session.discordUser.id,
          feature,
          enabled
        );

        res.json({ ok: true, ...result });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
