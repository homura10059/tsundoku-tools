import type { Product } from "@tsundoku-tools/shared";
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export default function WishlistProducts() {
  const wishlistId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("wishlistId")
      : null;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wishlistId) {
      setLoading(false);
      return;
    }
    api.wishlists
      .products(wishlistId)
      .then(setProducts)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [wishlistId]);

  if (!wishlistId) return null;
  if (loading) return <div className="text-gray-500">読み込み中…</div>;
  if (error) return <div className="text-red-600">エラー: {error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">商品一覧</h1>
      {products.length === 0 ? (
        <p className="text-gray-500">商品がありません。</p>
      ) : (
        <ul className="space-y-3">
          {products.map((p) => (
            <li key={p.asin} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-4">
                {p.imageUrl && (
                  <img
                    src={p.imageUrl}
                    alt={p.title}
                    className="w-16 h-16 object-contain shrink-0"
                  />
                )}
                <a
                  href={`/products?asin=${p.asin}`}
                  className="font-medium text-blue-700 hover:underline"
                >
                  {p.title}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
