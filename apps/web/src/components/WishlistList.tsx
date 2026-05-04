import type { Wishlist } from "@tsundoku-tools/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiProblemError } from "../lib/api-error.js";
import { api } from "../lib/api.js";
import { getToken } from "../lib/auth.js";
import { Toast } from "./Toast.js";
import { WishlistForm } from "./WishlistForm.js";

export default function WishlistList() {
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set());
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) {
      setUnauthenticated(true);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setWishlists(await api.wishlists.list());
    } catch (e) {
      if (e instanceof ApiProblemError && e.problem.status === 401) {
        setUnauthenticated(true);
      } else {
        setError(e instanceof ApiProblemError ? (e.problem.detail ?? e.problem.title) : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("このウィッシュリストを削除しますか?")) return;
    await api.wishlists.delete(id);
    await load();
  }

  async function handleToggle(w: Wishlist) {
    await api.wishlists.update(w.id, { isActive: !w.isActive });
    await load();
  }

  async function handleScrape(id: string) {
    setScrapeError(null);
    setScrapingIds((prev) => new Set([...prev, id]));
    try {
      await api.wishlists.scrape(id);
    } catch (e) {
      const detail =
        e instanceof ApiProblemError ? (e.problem.detail ?? e.problem.title) : String(e);
      setScrapeError(`スクレイプに失敗しました: ${detail}`);
    } finally {
      setScrapingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (loading) return <div className="text-gray-500">読み込み中…</div>;
  if (unauthenticated) return <div className="text-gray-500">ログインが必要です。</div>;
  if (error) return <div className="text-red-600">エラー: {error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">ウィッシュリスト</h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
        >
          + 追加
        </button>
      </div>

      {showForm && (
        <WishlistForm
          onSuccess={() => {
            setShowForm(false);
            load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {scrapeError && <Toast message={scrapeError} onDismiss={() => setScrapeError(null)} />}

      {wishlists.length === 0 ? (
        <p className="text-gray-500">ウィッシュリストがまだありません。</p>
      ) : (
        <ul className="space-y-3">
          {wishlists.map((w) => (
            <li key={w.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <a
                    href={`/products?wishlistId=${w.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {w.label}
                  </a>
                  <p className="text-xs text-gray-500 mt-1 break-all">{w.url}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {w.scrapeIntervalMinutes / 60}時間ごとにスクレイプ
                    {" · "}
                    <span className={w.isActive ? "text-green-600" : "text-gray-400"}>
                      {w.isActive ? "有効" : "停止中"}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleScrape(w.id)}
                    disabled={scrapingIds.has(w.id)}
                    className="text-xs px-3 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {scrapingIds.has(w.id) ? "スクレイプ中…" : "今すぐスクレイプ"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(w)}
                    className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100"
                  >
                    {w.isActive ? "停止" : "有効化"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(w.id)}
                    className="text-xs px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
                  >
                    削除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
