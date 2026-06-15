#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_MD_PATH = "CLAUDE.md";

function readStdin() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, terminal: false });
    const lines = [];
    rl.on("line", (line) => lines.push(line));
    rl.on("close", () => resolve(lines.join("\n")));
  });
}

function getGitDiff() {
  try {
    return execSync("git diff HEAD~1 HEAD --stat 2>/dev/null || git diff --cached --stat 2>/dev/null || echo '(no diff available)'", {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "(no diff available)";
  }
}

function getCommitMessages() {
  try {
    return execSync("git log --oneline -10 2>/dev/null || echo '(no commits)'", {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "(no commits)";
  }
}

function readClaudeMd() {
  try {
    return readFileSync(CLAUDE_MD_PATH, "utf-8");
  } catch {
    return "";
  }
}

async function main() {
  const stdinRaw = await readStdin();
  let sessionData = {};
  try {
    sessionData = JSON.parse(stdinRaw);
  } catch {
    // ignore parse errors
  }

  const transcriptPath = sessionData.transcript_path;
  let recentMessages = "";
  if (transcriptPath) {
    try {
      const lines = readFileSync(transcriptPath, "utf-8").trim().split("\n");
      // Take last 50 lines of transcript for context
      recentMessages = lines.slice(-50).join("\n");
    } catch {
      // ignore
    }
  }

  const currentClaudeMd = readClaudeMd();
  const gitDiff = getGitDiff();
  const commitMessages = getCommitMessages();

  const client = new Anthropic();

  const prompt = `あなたはプロジェクトの記録係です。Claudeとのセッションが終了しました。
現在の CLAUDE.md の内容と、このセッションで行われた変更を確認し、CLAUDE.md を更新すべきかどうか判断してください。

## CLAUDE.md のルール
- **全セッションで必要な情報のみ**を記載する
- 詳細情報は \`docs/\` 配下にファイルを作成し、リンクで参照する
- 開発スタイル・コマンド・環境変数・ソース構成・重要な制約など、毎回セッション開始時に把握すべき情報を記載する

## 現在の CLAUDE.md
\`\`\`markdown
${currentClaudeMd}
\`\`\`

## 最近のコミット（このセッションで行われた変更の概要）
\`\`\`
${commitMessages}
\`\`\`

## git diff（最新コミットの変更内容）
\`\`\`
${gitDiff}
\`\`\`

${recentMessages ? `## セッションの最後のやり取り（抜粋）\n\`\`\`\n${recentMessages}\n\`\`\`\n` : ""}

## 判断基準
以下の場合に更新が必要です：
- 新しいソースファイルが追加され、ソース構成の記述が古くなった
- 新しいコマンド・スクリプトが追加された
- 新しい環境変数が追加された
- 重要なアーキテクチャの決定や制約が新たに確立された
- 開発スタイルのルールが変更・追加された

以下の場合は更新不要です：
- バグ修正のみ
- テストの追加のみ（構造変化なし）
- リファクタリングのみ（外部仕様変化なし）
- CLAUDE.md が既に最新の状態を反映している

## 出力形式
必ず以下の JSON のみを出力してください（他のテキストは一切含めないこと）：

更新が必要な場合：
{"update": true, "content": "# CLAUDE.md\\n\\n（完全な新しい内容）"}

更新不要な場合：
{"update": false}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";

  let result;
  try {
    // Extract JSON even if surrounded by markdown code fences
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    result = jsonMatch ? JSON.parse(jsonMatch[0]) : { update: false };
  } catch {
    result = { update: false };
  }

  if (result.update && typeof result.content === "string") {
    writeFileSync(CLAUDE_MD_PATH, result.content, "utf-8");
    execSync(`git add ${CLAUDE_MD_PATH}`);
    execSync(`git commit -m "docs(CLAUDE.md): セッション終了時の自動更新"`);
    console.error("CLAUDE.md を更新しました。");
  } else {
    console.error("CLAUDE.md の更新は不要です。");
  }
}

main().catch((err) => {
  console.error("stop hook error:", err.message);
  process.exit(0);
});
