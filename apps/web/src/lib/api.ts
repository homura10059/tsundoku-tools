import type { PriceSnapshot, Product, Wishlist } from "@tsundoku-tools/shared";

const API_BASE =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.PUBLIC_API_URL ?? "http://localhost:8787")
    : "http://localhost:8787";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  wishlists: {
    list: () => request<Wishlist[]>("/api/wishlists"),
    get: (id: string) => request<Wishlist>(`/api/wishlists/${id}`),
    create: (data: { label: string; url: string }) =>
      request<Wishlist>("/api/wishlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Wishlist>) =>
      request<Wishlist>(`/api/wishlists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (id: string) => request<void>(`/api/wishlists/${id}`, { method: "DELETE" }),
  },
  products: {
    list: () => request<Product[]>("/api/products"),
    get: (asin: string) => request<Product>(`/api/products/${asin}`),
    snapshots: (asin: string, limit = 500) =>
      request<PriceSnapshot[]>(`/api/products/${asin}/snapshots?limit=${limit}`),
  },
};
