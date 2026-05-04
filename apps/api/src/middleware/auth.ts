import { createDb } from "@tsundoku-tools/db";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { validateSession } from "../auth/session.js";
import type { Bindings } from "../index.js";
import { problem } from "../lib/problem.js";

type AuthVariables = {
  userId: string;
  username: string;
  avatar: string | null;
};

export const requireAuth: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: AuthVariables;
}> = createMiddleware(async (c, next) => {
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

  c.set("userId", user.userId);
  c.set("username", user.username);
  c.set("avatar", user.avatar);
  await next();
});
