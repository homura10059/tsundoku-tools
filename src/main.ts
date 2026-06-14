import { config } from "./config.js";

const res = await fetch(config.discordWebhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    content: "[tsundoku-tools] ウォーキングスケルトン: 動作確認メッセージ",
  }),
});

if (res.ok) {
  console.log("Discord へ通知を送信しました。");
} else {
  console.error(`送信失敗: ${res.status} ${res.statusText}`);
  process.exit(1);
}
