import { describe, expect, it, vi } from "vitest";
import type { D1Client } from "../d1/client.js";
import type { WishlistItem } from "../types.js";
import type { ValidationError } from "../validate.js";
import {
  ITEM_SNAPSHOT_BATCH_SIZE,
  fetchLatestRunItems,
  insertItemSnapshots,
  pruneOldRuns,
  recordRun,
  recordValidationErrors,
  saveRunSnapshot,
} from "./snapshots.js";

function fakeClient(
  rows: unknown[],
): D1Client & { query: ReturnType<typeof vi.fn> } {
  return { query: vi.fn().mockResolvedValue(rows) };
}

const item = (overrides: Partial<WishlistItem> = {}): WishlistItem => ({
  title: "テスト本",
  url: "https://www.amazon.co.jp/dp/4065162963",
  format: "Kindle",
  P_base: 1000,
  P_kindle: 700,
  Pt: 0,
  hasPaperSwatch: true,
  ...overrides,
});

describe("recordRun", () => {
  it("runs へ1行 INSERT し RETURNING id で採番されたIDを返す", async () => {
    const client = fakeClient([{ id: 42 }]);

    const id = await recordRun(client, {
      wishlistId: 1,
      startedAt: "2026-08-01T00:00:00.000Z",
      finishedAt: "2026-08-01T00:01:00.000Z",
      items: [item(), item({ P_kindle: null })],
      dealCount: 1,
    });

    expect(id).toBe(42);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO runs/);
    expect(sql).toMatch(/RETURNING id/i);
    expect(params).toEqual([
      1,
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T00:01:00.000Z",
      2, // item_count
      1, // kindle_price_found
      2, // base_price_found
      2, // paper_swatch_count
      1, // deal_count
    ]);
  });

  it("items が空配列でも1行 INSERT する（すべて0件）", async () => {
    const client = fakeClient([{ id: 1 }]);

    await recordRun(client, {
      wishlistId: 1,
      startedAt: "2026-08-01T00:00:00.000Z",
      finishedAt: "2026-08-01T00:01:00.000Z",
      items: [],
      dealCount: 0,
    });

    const [, params] = client.query.mock.calls[0];
    expect(params.slice(3)).toEqual([0, 0, 0, 0, 0]);
  });

  it("RETURNING が空行を返した場合は例外を投げる", async () => {
    const client = fakeClient([]);

    await expect(
      recordRun(client, {
        wishlistId: 1,
        startedAt: "2026-08-01T00:00:00.000Z",
        finishedAt: "2026-08-01T00:01:00.000Z",
        items: [],
        dealCount: 0,
      }),
    ).rejects.toThrow(/id/);
  });
});

describe("insertItemSnapshots", () => {
  it("1件のとき item_key・has_paper_swatchの0/1変換を含めてINSERTする", async () => {
    const client = fakeClient([]);

    await insertItemSnapshots(client, 7, [item()]);

    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO item_snapshots/);
    expect(params).toEqual([
      7,
      "4065162963",
      "テスト本",
      "https://www.amazon.co.jp/dp/4065162963",
      "Kindle",
      1000,
      700,
      0,
      1,
    ]);
  });

  it("P_base/P_kindle が null の場合、null のまま params に渡る", async () => {
    const client = fakeClient([]);

    await insertItemSnapshots(client, 1, [
      item({ P_base: null, P_kindle: null }),
    ]);

    const [, params] = client.query.mock.calls[0];
    expect(params[5]).toBeNull();
    expect(params[6]).toBeNull();
  });

  it("hasPaperSwatch: false は 0 に変換される", async () => {
    const client = fakeClient([]);

    await insertItemSnapshots(client, 1, [item({ hasPaperSwatch: false })]);

    const [, params] = client.query.mock.calls[0];
    expect(params[8]).toBe(0);
  });

  it("空配列のときは query を呼ばない", async () => {
    const client = fakeClient([]);

    await insertItemSnapshots(client, 1, []);

    expect(client.query).not.toHaveBeenCalled();
  });

  it(`ちょうど ${ITEM_SNAPSHOT_BATCH_SIZE} 件は1クエリで送る`, async () => {
    const client = fakeClient([]);
    const items = Array.from({ length: ITEM_SNAPSHOT_BATCH_SIZE }, () =>
      item(),
    );

    await insertItemSnapshots(client, 1, items);

    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, params] = client.query.mock.calls[0];
    const placeholderGroups = sql.match(
      /\(\?, \?, \?, \?, \?, \?, \?, \?, \?\)/g,
    );
    expect(placeholderGroups).toHaveLength(ITEM_SNAPSHOT_BATCH_SIZE);
    expect(params).toHaveLength(ITEM_SNAPSHOT_BATCH_SIZE * 9);
  });

  it(`${ITEM_SNAPSHOT_BATCH_SIZE + 1} 件は2クエリに分割される（N件 + 1件）`, async () => {
    const client = fakeClient([]);
    const items = Array.from({ length: ITEM_SNAPSHOT_BATCH_SIZE + 1 }, () =>
      item(),
    );

    await insertItemSnapshots(client, 1, items);

    expect(client.query).toHaveBeenCalledTimes(2);
    const [, params1] = client.query.mock.calls[0];
    const [, params2] = client.query.mock.calls[1];
    expect(params1).toHaveLength(ITEM_SNAPSHOT_BATCH_SIZE * 9);
    expect(params2).toHaveLength(9);
  });

  it(`${ITEM_SNAPSHOT_BATCH_SIZE * 2} 件は2クエリに分割される（N件 + N件）`, async () => {
    const client = fakeClient([]);
    const items = Array.from({ length: ITEM_SNAPSHOT_BATCH_SIZE * 2 }, () =>
      item(),
    );

    await insertItemSnapshots(client, 1, items);

    expect(client.query).toHaveBeenCalledTimes(2);
  });
});

describe("recordValidationErrors", () => {
  it("空配列のときは query を呼ばない", async () => {
    const client = fakeClient([]);

    await recordValidationErrors(client, 1, []);

    expect(client.query).not.toHaveBeenCalled();
  });

  it("MISSING_REQUIRED_FIELDS は items 全体でなく件数だけを detail に含める", async () => {
    const client = fakeClient([]);
    const errors: ValidationError[] = [
      {
        type: "MISSING_REQUIRED_FIELDS",
        items: [item({ title: "" }), item({ title: "" })],
      },
    ];

    await recordValidationErrors(client, 1, errors);

    const [, params] = client.query.mock.calls[0];
    expect(params).toEqual([
      1,
      "MISSING_REQUIRED_FIELDS",
      JSON.stringify({ count: 2 }),
    ]);
  });

  it("ALL_PRICES_MISSING は detail が null", async () => {
    const client = fakeClient([]);
    const errors: ValidationError[] = [{ type: "ALL_PRICES_MISSING" }];

    await recordValidationErrors(client, 1, errors);

    const [, params] = client.query.mock.calls[0];
    expect(params).toEqual([1, "ALL_PRICES_MISSING", null]);
  });

  it("PRICE_EXTRACTION_DEGRADED は foundCount/totalCount を detail に含める", async () => {
    const client = fakeClient([]);
    const errors: ValidationError[] = [
      { type: "PRICE_EXTRACTION_DEGRADED", foundCount: 2, totalCount: 10 },
    ];

    await recordValidationErrors(client, 1, errors);

    const [, params] = client.query.mock.calls[0];
    expect(params[2]).toBe(JSON.stringify({ foundCount: 2, totalCount: 10 }));
  });

  it("REFERENCE_PRICE_EXTRACTION_DEGRADED は foundCount/totalCount を detail に含める", async () => {
    const client = fakeClient([]);
    const errors: ValidationError[] = [
      {
        type: "REFERENCE_PRICE_EXTRACTION_DEGRADED",
        foundCount: 1,
        totalCount: 8,
      },
    ];

    await recordValidationErrors(client, 1, errors);

    const [, params] = client.query.mock.calls[0];
    expect(params[2]).toBe(JSON.stringify({ foundCount: 1, totalCount: 8 }));
  });

  it("複数エラーは同一 run_id で全行 INSERT される", async () => {
    const client = fakeClient([]);
    const errors: ValidationError[] = [
      { type: "ALL_PRICES_MISSING" },
      { type: "PRICE_EXTRACTION_DEGRADED", foundCount: 1, totalCount: 2 },
    ];

    await recordValidationErrors(client, 99, errors);

    const [, params] = client.query.mock.calls[0];
    expect(params[0]).toBe(99);
    expect(params[3]).toBe(99);
  });
});

describe("saveRunSnapshot", () => {
  it("recordRun → insertItemSnapshots → recordValidationErrors の順に呼ぶ", async () => {
    const client = fakeClient([{ id: 5 }]);
    // insertItemSnapshots・recordValidationErrors はこのモックだと
    // 2回目以降も [{id:5}] を返すが、それらは results を無視するので問題ない。

    await saveRunSnapshot(client, {
      wishlistId: 1,
      startedAt: "2026-08-01T00:00:00.000Z",
      finishedAt: "2026-08-01T00:01:00.000Z",
      items: [item()],
      errors: [{ type: "ALL_PRICES_MISSING" }],
      dealCount: 0,
    });

    expect(client.query.mock.calls[0][0]).toMatch(/INSERT INTO runs/);
    expect(client.query.mock.calls[1][0]).toMatch(/INSERT INTO item_snapshots/);
    expect(client.query.mock.calls[2][0]).toMatch(
      /INSERT INTO run_validation_errors/,
    );
  });

  it("errors が空配列なら run_validation_errors への INSERT は発行されない", async () => {
    const client = fakeClient([{ id: 5 }]);

    await saveRunSnapshot(client, {
      wishlistId: 1,
      startedAt: "2026-08-01T00:00:00.000Z",
      finishedAt: "2026-08-01T00:01:00.000Z",
      items: [item()],
      errors: [],
      dealCount: 1,
    });

    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("recordRun が失敗したら以降を呼ばずに reject する", async () => {
    const client: D1Client & { query: ReturnType<typeof vi.fn> } = {
      query: vi.fn().mockRejectedValueOnce(new Error("boom")),
    };

    await expect(
      saveRunSnapshot(client, {
        wishlistId: 1,
        startedAt: "2026-08-01T00:00:00.000Z",
        finishedAt: "2026-08-01T00:01:00.000Z",
        items: [item()],
        errors: [],
        dealCount: 0,
      }),
    ).rejects.toThrow("boom");
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});

describe("pruneOldRuns", () => {
  it("既定の保持期間180日で item_snapshots→run_validation_errors→runs の順にDELETEする", async () => {
    const client = fakeClient([]);
    const now = new Date("2026-08-09T00:00:00.000Z");

    await pruneOldRuns(client, undefined, now);

    expect(client.query).toHaveBeenCalledTimes(3);
    const cutoff = "2026-02-10T00:00:00.000Z"; // 180日前
    const [sql1, params1] = client.query.mock.calls[0];
    const [sql2, params2] = client.query.mock.calls[1];
    const [sql3, params3] = client.query.mock.calls[2];
    expect(sql1).toMatch(/DELETE FROM item_snapshots/);
    expect(sql2).toMatch(/DELETE FROM run_validation_errors/);
    expect(sql3).toMatch(/DELETE FROM runs/);
    expect(params1[params1.length - 1]).toBe(cutoff);
    expect(params2[params2.length - 1]).toBe(cutoff);
    expect(params3[params3.length - 1]).toBe(cutoff);
  });

  it("retentionDays を指定するとその日数で cutoff を計算する", async () => {
    const client = fakeClient([]);
    const now = new Date("2026-08-09T00:00:00.000Z");

    await pruneOldRuns(client, 30, now);

    const [, params] = client.query.mock.calls[2];
    expect(params[0]).toBe("2026-07-10T00:00:00.000Z");
  });
});

// item_snapshots の1行分。D1 は INTEGER 列を number、NULL を null で返す。
const snapshotRow = (overrides: Record<string, unknown> = {}) => ({
  item_key: "4065162963",
  title: "テスト本",
  url: "https://www.amazon.co.jp/dp/4065162963",
  format: "Kindle",
  base_price: 1000,
  kindle_price: 700,
  points: 0,
  has_paper_swatch: 1,
  ...overrides,
});

describe("fetchLatestRunItems", () => {
  it("直前の run を wishlist_id で絞り started_at の降順1件に限定して問い合わせる", async () => {
    const client = fakeClient([]);

    await fetchLatestRunItems(client, 7);

    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/FROM item_snapshots/);
    expect(sql).toMatch(/SELECT id FROM runs WHERE wishlist_id = \?/);
    expect(sql).toMatch(/ORDER BY started_at DESC, id DESC/);
    expect(sql).toMatch(/LIMIT 1/);
    expect(params).toEqual([7]);
  });

  it("item_key をキーにした Map で返す", async () => {
    const client = fakeClient([
      snapshotRow({ item_key: "AAAAAAAAAA" }),
      snapshotRow({ item_key: "BBBBBBBBBB", title: "別の本" }),
    ]);

    const items = await fetchLatestRunItems(client, 1);

    expect([...items.keys()]).toEqual(["AAAAAAAAAA", "BBBBBBBBBB"]);
    expect(items.get("BBBBBBBBBB")?.title).toBe("別の本");
  });

  it("行を WishlistItem に復元する（has_paper_swatch の 0/1 を boolean に直す）", async () => {
    const client = fakeClient([snapshotRow({ has_paper_swatch: 0 })]);

    const items = await fetchLatestRunItems(client, 1);

    expect(items.get("4065162963")).toEqual({
      title: "テスト本",
      url: "https://www.amazon.co.jp/dp/4065162963",
      format: "Kindle",
      P_base: 1000,
      P_kindle: 700,
      Pt: 0,
      hasPaperSwatch: false,
    });
  });

  it("base_price / kindle_price の NULL を null のまま復元する", async () => {
    const client = fakeClient([
      snapshotRow({ base_price: null, kindle_price: null }),
    ]);

    const item = await fetchLatestRunItems(client, 1);

    expect(item.get("4065162963")?.P_base).toBeNull();
    expect(item.get("4065162963")?.P_kindle).toBeNull();
  });

  it("直前の run がなければ空の Map を返す", async () => {
    const client = fakeClient([]);

    const items = await fetchLatestRunItems(client, 1);

    expect(items.size).toBe(0);
  });

  it("未知の format は「その他」に丸める", async () => {
    const client = fakeClient([snapshotRow({ format: "Audible版" })]);

    const items = await fetchLatestRunItems(client, 1);

    expect(items.get("4065162963")?.format).toBe("その他");
  });

  it("同じ run 内で item_key が重複したら後の行で上書きする", async () => {
    const client = fakeClient([
      snapshotRow({ kindle_price: 700 }),
      snapshotRow({ kindle_price: 650 }),
    ]);

    const items = await fetchLatestRunItems(client, 1);

    expect(items.size).toBe(1);
    expect(items.get("4065162963")?.P_kindle).toBe(650);
  });
});
