import { describe, expect, it, vi } from "vitest";
import { createD1Client } from "./client.js";

const credentials = {
  accountId: "acct-123",
  apiToken: "token-abc",
  databaseId: "db-456",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successBody(results: unknown[]) {
  return {
    result: [{ results, success: true, meta: {} }],
    success: true,
    errors: [],
    messages: [],
  };
}

describe("createD1Client", () => {
  it("D1 の query エンドポイントへ SQL と params を POST する", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(successBody([])));
    const client = createD1Client(credentials, fetchImpl);

    await client.query("SELECT * FROM wishlists WHERE id = ?", [1]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-123/d1/database/db-456/query",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-abc");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      sql: "SELECT * FROM wishlists WHERE id = ?",
      params: [1],
    });
  });

  it("params 省略時は空配列を送る", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(successBody([])));
    const client = createD1Client(credentials, fetchImpl);

    await client.query("SELECT 1");

    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(init.body).params).toEqual([]);
  });

  it("result[0].results の行を返す", async () => {
    const rows = [{ id: 1, name: "メイン" }];
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(successBody(rows)));
    const client = createD1Client(credentials, fetchImpl);

    await expect(client.query("SELECT * FROM wishlists")).resolves.toEqual(
      rows,
    );
  });

  it("行を返さないステートメントでは空配列を返す", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        result: [{ success: true, meta: {} }],
        success: true,
        errors: [],
        messages: [],
      }),
    );
    const client = createD1Client(credentials, fetchImpl);

    await expect(client.query("DELETE FROM runs")).resolves.toEqual([]);
  });

  it("HTTP エラー時は例外を投げる", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 403 }));
    const client = createD1Client(credentials, fetchImpl);

    await expect(client.query("SELECT 1")).rejects.toThrow(/403/);
  });

  it("API トークンを例外メッセージに含めない", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 403 }));
    const client = createD1Client(credentials, fetchImpl);

    await expect(client.query("SELECT 1")).rejects.not.toThrow(/token-abc/);
  });

  it("success: false のときは errors のメッセージを含む例外を投げる", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        result: [],
        success: false,
        errors: [{ code: 7500, message: "no such table: wishlists" }],
        messages: [],
      }),
    );
    const client = createD1Client(credentials, fetchImpl);

    await expect(client.query("SELECT 1")).rejects.toThrow(
      /no such table: wishlists/,
    );
  });
});
