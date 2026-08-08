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

      if (!res.ok) {
        throw new Error(`D1 リクエスト失敗: ${res.status} ${res.statusText}`);
      }

      const body = (await res.json()) as D1Response;

      if (body.success === false) {
        const detail =
          body.errors?.map((e) => e.message ?? String(e.code)).join(", ") ??
          "不明なエラー";
        throw new Error(`D1 クエリ失敗: ${detail}`);
      }

      return (body.result?.[0]?.results ?? []) as T[];
    },
  };
}
