import type { PriceSnapshot, Product, Wishlist } from "@tsundoku-tools/shared";
import { getToken } from "./auth";

export function normalizeApiBase(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const API_BASE = normalizeApiBase(
  typeof import.meta !== "undefined"
    ? import.meta.env?.PUBLIC_API_URL || "http://localhost:8787"
    : "http://localhost:8787",
);

type AuthUser = {
  userId: string;
  username: string;
  avatar: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const mergedInit = Object.keys(headers).length > 0 ? { ...init, headers } : init;
  const res = await fetch(`${API_BASE}${path}`, mergedInit);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `HTMLレスポンスを受信しました。PUBLIC_API_URL の設定を確認してください (現在: ${API_BASE})`,
    );
  }
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    me: () => request<AuthUser>("/auth/me"),
    logout: () =>
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      }),
  },
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
    products: (id: string) => request<Product[]>(`/api/wishlists/${id}/products`),
  },
  products: {
    list: () => request<Product[]>("/api/products"),
    get: (asin: string) => request<Product>(`/api/products/${asin}`),
    snapshots: (asin: string, limit = 500) =>
      request<PriceSnapshot[]>(`/api/products/${asin}/snapshots?limit=${limit}`),
  },
};
