import type { Deal } from "./types.js";

const THRESHOLD = 0.20;

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
    fields.push({ name: "割引率", value: formatRate(deal.discountRate), inline: true });
  }

  if (deal.pointRate >= THRESHOLD) {
    fields.push({ name: "ポイント還元率", value: formatRate(deal.pointRate), inline: true });
  }

  return { title: deal.title, url: deal.url, color: 0xff9900, fields };
}

export async function notify(deals: Deal[], webhookUrl: string): Promise<void> {
  for (const deal of deals) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [buildEmbed(deal)] }),
    });

    if (!res.ok) {
      console.error(`Discord通知失敗: ${res.status} ${res.statusText} (${deal.title})`);
    }
  }
}
