import { useState } from "react";
import { api } from "../lib/api.js";

type Props = {
  onSuccess: () => void;
  onCancel: () => void;
};

export function WishlistForm({ onSuccess, onCancel }: Props) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.wishlists.create({ label, url });
      onSuccess();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <h2 className="font-semibold mb-4">ウィッシュリストを追加</h2>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">名前</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          placeholder="例: 技術書"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Amazon ウィッシュリスト URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          placeholder="https://www.amazon.co.jp/wishlist/ls/..."
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "追加中…" : "追加"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded text-sm border border-gray-300 hover:bg-gray-100"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
