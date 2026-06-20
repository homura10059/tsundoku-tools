import type { Deal } from "./types.js";
import { jitter } from "./util/jitter.js";

// ステートレス運用: 通知履歴は保持しない。セール継続中は毎回同じ商品が通知される。

const THRESHOLD = 0.2;
const CHUNK_SIZE = 5;

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

function buildEmbed(deal: Deal): DiscordEmbed {
  const fields: DiscordEmbedField[] = [
    { name: "Kindle価格", value: formatCurrency(deal.P_kindle), inline: true },
  ];

  if (deal.discountRate >= THRESHOLD) {
    fields.push({
      name: "割引率",
      value: formatRate(deal.discountRate),
      inline: true,
    });
  }

  if (deal.pointRate >= THRESHOLD) {
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

export async function notify(deals: Deal[], webhookUrl: string): Promise<void> {
  const chunks = chunk(deals, CHUNK_SIZE);
  for (let i = 0; i < chunks.length; i++) {
    const embeds = chunks[i].map(buildEmbed);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds }),
    });

    if (!res.ok) {
      console.error(`Discord通知失敗: ${res.status} ${res.statusText}`);
    }

    if (i < chunks.length - 1) {
      await jitter(2_000, 3_000);
    }
  }
}
