
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getManageableGuilds } from "../discord.js";

export default function createServersRouter(client) {
  const router = Router();

  router.get("/", requireAuth, async (req, res, next) => {
    try {
      const guilds = await getManageableGuilds(
        req.session.discordAccessToken
      );

      const servers = await Promise.all(
        guilds.map(async guild => {
          let botPresent = false;

          try {
            await client.guilds.fetch(guild.id);
            botPresent = true;
          } catch {
            // MaherBot may not be in this server.
          }

          return {
            id: guild.id,
            name: guild.name,
            icon: guild.icon
              ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
              : null,
            botPresent
          };
        })
      );

      res.json({ servers });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
