import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { productsRouter } from "./routes/products.js";
import { wishlistsRouter } from "./routes/wishlists.js";

export type Bindings = {
  DB: D1Database;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  API_URL: string;
  WEB_URL: string;
  DISCORD_WEBHOOK_URL?: string;
  DISCORD_ERROR_WEBHOOK_URL?: string;
  NOTIFY_MIN_PRICE_DROP_PCT?: string;
  NOTIFY_MIN_POINT_CHANGE?: string;
  NOTIFY_COOLDOWN_HOURS?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: (origin) => origin,
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.route("/auth", authRouter);

app.use("/api/*", requireAuth);
app.route("/api/wishlists", wishlistsRouter);
app.route("/api/products", productsRouter);

app.get("/", (c) => c.json({ status: "ok" }));

export default app;
