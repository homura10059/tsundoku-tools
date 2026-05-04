import type { PriceSnapshot, Product } from "@tsundoku-tools/shared";
import { formatPriceJpy } from "@tsundoku-tools/shared";
import { useEffect, useState } from "react";
import { ApiProblemError } from "../lib/api-error.js";
import { api } from "../lib/api.js";
import { PriceHistoryChart } from "./PriceHistoryChart.js";

export default function ProductDetail() {
  const asin =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("asin") : null;

  const [product, setProduct] = useState<Product | null>(null);
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!asin) {
      setLoading(false);
      return;
    }
    Promise.all([api.products.get(asin), api.products.snapshots(asin)])
      .then(([p, s]) => {
        setProduct(p);
        setSnapshots(s);
      })
      .catch((e) =>
        setError(e instanceof ApiProblemError ? (e.problem.detail ?? e.problem.title) : String(e)),
      )
      .finally(() => setLoading(false));
  }, [asin]);

  if (!asin) return <p className="text-gray-500">ASIN が指定されていません。</p>;
  if (loading) return <div className="text-gray-500">読み込み中…</div>;
  if (error) return <div className="text-red-600">エラー: {error}</div>;
  if (!product) return <p className="text-gray-500">商品が見つかりません。</p>;

  const latest = snapshots[snapshots.length - 1];

  return (
    <div>
      <div className="flex items-start gap-4 mb-8">
        {product.imageUrl && (
          <img src={product.imageUrl} alt={product.title} className="w-24 h-24 object-contain" />
        )}
        <div>
          <h1 className="text-xl font-bold mb-1">{product.title}</h1>
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            Amazon で見る →
          </a>
        </div>
      </div>

      {latest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <Stat
            label="現在価格"
            value={latest.priceJpy != null ? formatPriceJpy(latest.priceJpy) : "—"}
          />
          <Stat
            label="参考価格"
            value={latest.listPriceJpy != null ? formatPriceJpy(latest.listPriceJpy) : "—"}
          />
          <Stat
            label="値引率"
            value={latest.discountRatePct != null ? `${latest.discountRatePct}%` : "—"}
          />
          <Stat label="ポイント" value={latest.points != null ? `${latest.points}pt` : "—"} />
        </div>
      )}

      {snapshots.length > 0 && <PriceHistoryChart snapshots={snapshots} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
