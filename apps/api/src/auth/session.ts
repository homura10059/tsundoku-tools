import type { Database } from "@tsundoku-tools/db";
import { sessions, users } from "@tsundoku-tools/db";
import { eq } from "drizzle-orm";
import type { DiscordUser } from "./discord.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function upsertUser(db: Database, discordUser: DiscordUser): Promise<string> {
  const now = new Date().toISOString();
  const existing = await db.select().from(users).where(eq(users.discordId, discordUser.id)).get();

  if (existing) {
    await db
      .update(users)
      .set({ username: discordUser.username, avatar: discordUser.avatar, updatedAt: now })
      .where(eq(users.discordId, discordUser.id));
    return existing.id;
  }

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    discordId: discordUser.id,
    username: discordUser.username,
    avatar: discordUser.avatar,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function createSession(db: Database, userId: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.insert(sessions).values({ id, userId, expiresAt, createdAt: now });
  return id;
}

export async function validateSession(
  db: Database,
  sessionId: string,
): Promise<{ userId: string; username: string; avatar: string | null } | null> {
  const row = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .get();

  if (!row) return null;
  if (row.session.expiresAt < new Date().toISOString()) return null;
  return { userId: row.user.id, username: row.user.username, avatar: row.user.avatar };
}

export async function deleteSession(db: Database, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
