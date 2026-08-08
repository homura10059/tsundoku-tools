const API_BASE = "https://api.cloudflare.com/client/v4";

export interface D1Credentials {
  accountId: string;
  apiToken: string;
  databaseId: string;
}

export interface D1Client {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
}

interface D1QueryResult {
  results?: unknown[];
}

interface D1Response {
  result?: D1QueryResult[];
  success?: boolean;
  errors?: { code?: number; message?: string }[];
}

/**
 * Cloudflare D1 の REST API クライアント。
 *
 * D1 のバインディングは Workers からしか使えないが、本ツールの実行部は
 * Playwright を必要とするため Node（GitHub Actions）上で動く。そのため
 * HTTP の query エンドポイントを直接叩く。
 *
 * fetch を差し替えられるようにしてあるのはテストのため。
 */
export function createD1Client(
  credentials: D1Credentials,
  fetchImpl: typeof fetch = fetch,
): D1Client {
  const endpoint = `${API_BASE}/accounts/${credentials.accountId}/d1/database/${credentials.databaseId}/query`;

  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          // 注意: このトークンを例外メッセージやログへ載せないこと。
          Authorization: `Bearer ${credentials.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
      });

      // Cloudflare API は HTTP エラー（400/403 等）でも success:false の JSON
      // ボディに具体的な原因（不正な database_id 等）を返すことが多いので、
      // ステータスに関わらず本文を読んで例外メッセージに含める。
      const text = await res.text();
      let body: D1Response | undefined;
      try {
        body = JSON.parse(text) as D1Response;
      } catch {
        // JSON でない場合（HTML エラーページ等）はそのまま text を使う。
      }

      if (!res.ok || body?.success === false) {
        const detail =
          body?.errors?.map((e) => e.message ?? String(e.code)).join(", ") ||
          text.slice(0, 300);
        throw new Error(
          `D1 リクエスト失敗: ${res.status} ${res.statusText}${detail ? ` - ${detail}` : ""}`,
        );
      }

      return (body?.result?.[0]?.results ?? []) as T[];
    },
  };
}
