import type { PriceAlert } from "@tsundoku-tools/shared";
import { formatPriceJpy } from "@tsundoku-tools/shared";

const COLORS = {
  price_drop: 0x00c851,
  price_rise: 0xff4444,
  new_discount: 0x00c851,
  point_change: 0x33b5e5,
  back_in_stock: 0xffbb33,
  out_of_stock: 0x9e9e9e,
} as const;

const LABELS = {
  price_drop: "価格下落",
  price_rise: "価格上昇",
  new_discount: "値引き開始",
  point_change: "ポイント変動",
  back_in_stock: "在庫復活",
  out_of_stock: "在庫切れ",
} as const;

function buildEmbed(alert: PriceAlert): Record<string, unknown> {
  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (alert.oldValue !== null && alert.newValue !== null) {
    const isPrice = ["price_drop", "price_rise", "new_discount"].includes(alert.type);
    const format = isPrice ? formatPriceJpy : (v: number) => `${v}pt`;

    fields.push(
      { name: "変更前", value: format(alert.oldValue), inline: true },
      { name: "変更後", value: format(alert.newValue), inline: true },
    );

    if (alert.changePct !== null) {
      const sign = alert.changePct > 0 ? "+" : "";
      fields.push({
        name: "変化率",
        value: `${sign}${alert.changePct.toFixed(1)}%`,
        inline: true,
      });
    }
  }

  return {
    title: `${LABELS[alert.type]}: ${alert.title}`,
    url: alert.productUrl,
    color: COLORS[alert.type],
    fields,
    timestamp: new Date().toISOString(),
  };
}

export async function sendDiscordAlert(
  webhookUrl: string,
  alert: PriceAlert,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [buildEmbed(alert)] }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord webhook failed ${response.status}: ${body}`);
  }
}
