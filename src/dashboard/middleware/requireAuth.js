
export function requireAuth(req, res, next) {
  if (!req.session?.discordUser || !req.session?.discordAccessToken) {
    return res.status(401).json({
      error: "Please sign in with Discord first."
    });
  }

  next();
}
