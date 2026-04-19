import { Hono } from "hono";
import { cors } from "hono/cors";
import { productsRouter } from "./routes/products.js";
import { wishlistsRouter } from "./routes/wishlists.js";

export type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

app.route("/api/wishlists", wishlistsRouter);
app.route("/api/products", productsRouter);

app.get("/", (c) => c.json({ status: "ok" }));

export default app;
