import type { AmazonListId, Asin, WishlistId } from "@tsundoku-tools/shared";
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const wishlists = sqliteTable("wishlists", {
  id: text("id").primaryKey().$type<WishlistId>(),
  amazonListId: text("amazon_list_id").notNull().unique().$type<AmazonListId>(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  scrapeIntervalMinutes: integer("scrape_interval_minutes").notNull().default(360),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const products = sqliteTable("products", {
  asin: text("asin").primaryKey().$type<Asin>(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  imageUrl: text("image_url"),
  category: text("category"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const wishlistProducts = sqliteTable(
  "wishlist_products",
  {
    id: text("id").primaryKey(),
    wishlistId: text("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" })
      .$type<WishlistId>(),
    asin: text("asin")
      .notNull()
      .references(() => products.asin, { onDelete: "cascade" })
      .$type<Asin>(),
    addedAt: text("added_at").notNull(),
    removedAt: text("removed_at"),
  },
  (t) => [unique("uniq_wishlist_asin").on(t.wishlistId, t.asin)],
);

export const priceSnapshots = sqliteTable("price_snapshots", {
  id: text("id").primaryKey(),
  asin: text("asin")
    .notNull()
    .references(() => products.asin, { onDelete: "cascade" })
    .$type<Asin>(),
  scrapedAt: text("scraped_at").notNull(),
  priceJpy: integer("price_jpy"),
  listPriceJpy: integer("list_price_jpy"),
  discountRatePct: real("discount_rate_pct"),
  points: integer("points"),
  pointRatePct: real("point_rate_pct"),
  isPrime: integer("is_prime", { mode: "boolean" }).notNull().default(false),
  inStock: integer("in_stock", { mode: "boolean" }).notNull().default(true),
  seller: text("seller"),
  couponPct: real("coupon_pct"),
  couponJpy: integer("coupon_jpy"),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  asin: text("asin")
    .notNull()
    .references(() => products.asin, { onDelete: "cascade" })
    .$type<Asin>(),
  notificationType: text("notification_type").notNull(),
  oldValue: real("old_value"),
  newValue: real("new_value"),
  changePct: real("change_pct"),
  sentAt: text("sent_at").notNull(),
  discordMessageId: text("discord_message_id"),
});

export const scrapeJobs = sqliteTable("scrape_jobs", {
  id: text("id").primaryKey(),
  wishlistId: text("wishlist_id")
    .notNull()
    .references(() => wishlists.id, { onDelete: "cascade" })
    .$type<WishlistId>(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status").notNull().default("running"),
  productsScraped: integer("products_scraped").notNull().default(0),
  errors: text("errors"),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  avatar: text("avatar"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});
