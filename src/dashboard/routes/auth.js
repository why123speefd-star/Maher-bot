
import { Router } from "express";
import {
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  getDiscordLoginUrl,
  exchangeCode,
  discordRequest,
} from "../auth.js";

const router = Router();

const SESSION_COOKIE_NAME = "maher.sid";

function makeState() {
  return randomBytes(32).toString("hex");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const first = Buffer.from(a);
  const second = Buffer.from(b);

  return (
    first.length === second.length &&
    timingSafeEqual(first, second)
  );
}

function requireLogin(req, res, next) {
  if (
    !req.session?.discordUser ||
    !req.session?.discordAccessToken
  ) {
    return res.status(401).json({
      error: "You must log in with Discord first.",
    });
  }

  next();
}

// Start Discord OAuth2 login.
router.get("/discord", (req, res, next) => {
  try {
    const state = makeState();

    req.session.oauthState = state;

    req.session.save((error) => {
      if (error) return next(error);

      try {
        res.redirect(getDiscordLoginUrl(state));
      } catch (urlError) {
        next(urlError);
      }
    });
  } catch (error) {
    next(error);
  }
});

// Discord OAuth2 callback.
router.get("/discord/callback", async (req, res, next) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).send(
        "Discord login was cancelled. Please try again."
      );
    }

    if (
      typeof code !== "string" ||
      !safeEqual(state, req.session?.oauthState)
    ) {
      return res.status(400).send(
        "Invalid or expired OAuth state. Please try logging in again."
      );
    }

    delete req.session.oauthState;

    const tokens = await exchangeCode(code);

    if (!tokens.access_token) {
      return res.status(502).send(
        "Discord did not return an access token."
      );
    }

    const user = await discordRequest(
      "/users/@me",
      tokens.access_token
    );

    if (!user?.id) {
      return res.status(502).send(
        "Could not retrieve your Discord account."
      );
    }

    // Regenerate the session to prevent session fixation.
    req.session.regenerate((error) => {
      if (error) return next(error);

      req.session.discordUser = {
        id: user.id,
        username: user.global_name || user.username,
        avatar: user.avatar ?? null,
      };

      req.session.discordAccessToken = tokens.access_token;

      req.session.save((saveError) => {
        if (saveError) return next(saveError);

        // Change this destination if your dashboard uses another route.
        res.redirect("/servers.html");
      });
    });
  } catch (error) {
    next(error);
  }
});

// Return the signed-in user's public profile.
router.get("/me", (req, res) => {
  if (!req.session?.discordUser) {
    return res.json({ user: null });
  }

  const user = req.session.discordUser;

  res.json({
    user: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : null,
    },
  });
});

// Provide a CSRF token for authenticated dashboard requests.
router.get("/csrf", requireLogin, (req, res, next) => {
  try {
    if (!req.session.csrfToken) {
      req.session.csrfToken = randomBytes(32).toString("hex");
    }

    req.session.save((error) => {
      if (error) return next(error);

      res.json({ csrfToken: req.session.csrfToken });
    });
  } catch (error) {
    next(error);
  }
});

// Log out. Requires the CSRF token returned by GET /auth/csrf.
router.post("/logout", requireLogin, (req, res, next) => {
  const submittedToken = req.get("X-CSRF-Token");
  const sessionToken = req.session.csrfToken;

  if (!safeEqual(submittedToken, sessionToken)) {
    return res.status(403).json({
      error: "Invalid CSRF token.",
    });
  }

  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.json({ ok: true });
  });
});

export default router;
