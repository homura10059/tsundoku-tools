import type { Deal, Wishlist } from "./types.js";
import { jitter } from "./util/jitter.js";
import type { ValidationError } from "./validate.js";

// ステートレス運用: 通知履歴は保持しない。セール継続中は毎回同じ商品が通知される。
// D1 にスナップショットを保存するようになっても、この方針は変えない
// （保存はあくまで観測目的で、通知の判断には使わない）。

const CHUNK_SIZE = 5;

/** 通知に必要なリスト情報。閾値は表示するフィールドの選別にも使う。 */
type NotifyContext = Pick<Wishlist, "name" | "threshold">;

function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

interface DiscordEmbedField {
  name: string;
  value: string;
  inline: boolean;
}

interface DiscordEmbed {
  title: string;
  url: string;
  color: number;
  fields: DiscordEmbedField[];
}

function buildEmbed(deal: Deal, threshold: number): DiscordEmbed {
  const fields: DiscordEmbedField[] = [
    { name: "Kindle価格", value: formatCurrency(deal.P_kindle), inline: true },
  ];

  if (deal.discountRate >= threshold) {
    fields.push({
      name: "割引率",
      value: formatRate(deal.discountRate),
      inline: true,
    });
  }

  if (deal.pointRate >= threshold) {
    fields.push({
      name: "ポイント還元率",
      value: formatRate(deal.pointRate),
      inline: true,
    });
  }

  return { title: deal.title, url: deal.url, color: 0xff9900, fields };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * ヒットした商品を Discord へ送信する。
 *
 * 複数リストを巡回するため、どのリスト由来のヒットかが分かるように
 * リスト名を content に載せ、リストごとに分けて送信する。
 */
export async function notify(
  deals: Deal[],
  webhookUrl: string,
  wishlist: NotifyContext,
): Promise<void> {
  const chunks = chunk(deals, CHUNK_SIZE);
  for (let i = 0; i < chunks.length; i++) {
    const embeds = chunks[i].map((deal) =>
      buildEmbed(deal, wishlist.threshold),
    );
    const progress = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `**[${wishlist.name}]**${progress}`,
        embeds,
      }),
    });

    if (!res.ok) {
      console.error(`Discord通知失敗: ${res.status} ${res.statusText}`);
    }

    if (i < chunks.length - 1) {
      await jitter(2_000, 3_000);
    }
  }
}

function buildErrorField(error: ValidationError): DiscordEmbedField {
  switch (error.type) {
    case "MISSING_REQUIRED_FIELDS":
      return {
        name: "必須フィールド欠損",
        value: `${error.items.length}件のアイテムで title または url が空です。`,
        inline: false,
      };
    case "ALL_PRICES_MISSING":
      return {
        name: "価格情報が全滅",
        value: "全アイテムで価格情報が取得できませんでした。",
        inline: false,
      };
    case "PRICE_EXTRACTION_DEGRADED":
      return {
        name: "Kindle価格の取得率が低下",
        value: `${error.totalCount}件中 ${error.foundCount}件しか Kindle価格を取得できませんでした。`,
        inline: false,
      };
    case "REFERENCE_PRICE_EXTRACTION_DEGRADED":
      return {
        name: "紙版価格の取得率が低下",
        value: `紙版スワッチが見つかった${error.totalCount}件中 ${error.foundCount}件しか参考価格を取得できませんでした。`,
        inline: false,
      };
  }
}

export async function notifyError(
  errors: ValidationError[],
  webhookUrl: string,
  wishlistName: string,
): Promise<void> {
  const fields = errors.map(buildErrorField);

  const embed = {
    title: `ウィッシュリスト監視エラー: ${wishlistName}`,
    color: 0xff0000,
    fields,
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) {
    console.error(`Discord エラー通知失敗: ${res.status} ${res.statusText}`);
  }
}
