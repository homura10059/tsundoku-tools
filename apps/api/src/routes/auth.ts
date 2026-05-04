import { createDb } from "@tsundoku-tools/db";
import { Hono } from "hono";
import { exchangeCode, getDiscordAuthUrl, getDiscordUser } from "../auth/discord.js";
import { createSession, deleteSession, upsertUser, validateSession } from "../auth/session.js";
import { generateState, verifyState } from "../auth/state.js";
import type { Bindings } from "../index.js";
import { problem } from "../lib/problem.js";

const DISCORD_CALLBACK_PATH = "/auth/discord/callback";

export const authRouter = new Hono<{ Bindings: Bindings }>();

authRouter.get("/discord", async (c) => {
  const state = await generateState(c.env.SESSION_SECRET);
  const redirectUri = `${c.env.API_URL}${DISCORD_CALLBACK_PATH}`;
  const url = getDiscordAuthUrl(c.env.DISCORD_CLIENT_ID, redirectUri, state);
  return c.redirect(url);
});

authRouter.get("/discord/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return problem(c, 400, "Bad Request", "Missing code or state.");
  }

  const valid = await verifyState(state, c.env.SESSION_SECRET);
  if (!valid) {
    return problem(c, 400, "Bad Request", "Invalid state.");
  }

  const redirectUri = `${c.env.API_URL}${DISCORD_CALLBACK_PATH}`;

  try {
    const accessToken = await exchangeCode(
      code,
      c.env.DISCORD_CLIENT_ID,
      c.env.DISCORD_CLIENT_SECRET,
      redirectUri,
    );
    const discordUser = await getDiscordUser(accessToken);
    const db = createDb(c.env.DB);
    const userId = await upsertUser(db, discordUser);
    const sessionId = await createSession(db, userId);

    const webUrl = new URL(c.env.WEB_URL);
    webUrl.searchParams.set("token", sessionId);
    return c.redirect(webUrl.toString());
  } catch {
    return problem(c, 500, "Internal Server Error", "Authentication failed.");
  }
});

authRouter.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return problem(c, 401, "Unauthorized");
  }

  const db = createDb(c.env.DB);
  const user = await validateSession(db, token);
  if (!user) {
    return problem(c, 401, "Unauthorized");
  }

  return c.json({ userId: user.userId, username: user.username, avatar: user.avatar });
});

authRouter.post("/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    const db = createDb(c.env.DB);
    await deleteSession(db, token);
  }

  return c.json({ ok: true });
});
