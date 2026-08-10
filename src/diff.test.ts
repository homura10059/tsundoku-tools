import { describe, expect, it } from "vitest";
import { extractItemKey } from "./asin.js";
import { selectChangedDeals } from "./diff.js";
import { judge } from "./judge.js";
import type { WishlistItem } from "./types.js";

// 既定では 1000円 → 700円（30%off）で閾値 0.2 にヒットする。
const item = (overrides: Partial<WishlistItem> = {}): WishlistItem => ({
  title: "テスト本",
  url: "https://www.amazon.co.jp/dp/AAAAAAAAAA",
  format: "Kindle",
  P_base: 1000,
  P_kindle: 700,
  Pt: 0,
  hasPaperSwatch: true,
  ...overrides,
});

// 保存側（insertItemSnapshots）と同じキーで前回スナップショットを組む。
const previous = (...items: WishlistItem[]) =>
  new Map(items.map((i) => [extractItemKey(i.url), i]));

describe("selectChangedDeals", () => {
  it("前回スナップショットが空なら全件そのまま返す（初回実行）", () => {
    const deals = judge([item()], 0.2);

    expect(selectChangedDeals(deals, new Map(), 0.2)).toEqual(deals);
  });

  it("前回スナップショットに存在しない商品は通知する", () => {
    const deals = judge(
      [item({ url: "https://www.amazon.co.jp/dp/NEWNEWNEW1" })],
      0.2,
    );
    const prev = previous(item());

    expect(selectChangedDeals(deals, prev, 0.2)).toEqual(deals);
  });

  it("前回は閾値未満だった商品が今回ヒットしたら通知する", () => {
    const deals = judge([item({ P_kindle: 700 })], 0.2);
    // 前回は 1000円 → 900円（10%off）で対象外だった。
    const prev = previous(item({ P_kindle: 900 }));

    expect(selectChangedDeals(deals, prev, 0.2)).toEqual(deals);
  });

  it("前回も今回もヒットしていて価格・ポイントが同じなら通知しない", () => {
    const deals = judge([item()], 0.2);
    const prev = previous(item());

    expect(selectChangedDeals(deals, prev, 0.2)).toEqual([]);
  });

  it("紙版が絶版でプレミア価格が続いていても、価格が動かなければ通知しない", () => {
    // 絶版の紙版が 8000円（プレミア価格）、Kindle は 1200円のまま毎日変わらない。
    const premium = item({ P_base: 8000, P_kindle: 1200 });
    const deals = judge([premium], 0.2);

    expect(deals).toHaveLength(1); // judge 自体は毎回ヒットし続ける
    expect(selectChangedDeals(deals, previous(premium), 0.2)).toEqual([]);
  });

  it("前回もヒットしていても Kindle 価格が下がっていれば通知する", () => {
    const deals = judge([item({ P_kindle: 650 })], 0.2);
    const prev = previous(item({ P_kindle: 700 }));

    expect(selectChangedDeals(deals, prev, 0.2)).toEqual(deals);
  });

  it("前回もヒットしていてもポイントが増えていれば通知する", () => {
    const deals = judge([item({ Pt: 300 })], 0.2);
    const prev = previous(item({ Pt: 100 }));

    expect(selectChangedDeals(deals, prev, 0.2)).toEqual(deals);
  });

  it("Kindle 価格が上がっただけなら通知しない", () => {
    const deals = judge([item({ P_kindle: 750 })], 0.2);
    const prev = previous(item({ P_kindle: 700 }));

    expect(selectChangedDeals(deals, prev, 0.2)).toEqual([]);
  });

  it("ポイントが減っただけなら通知しない", () => {
    const deals = judge([item({ Pt: 100 })], 0.2);
    const prev = previous(item({ Pt: 300 }));

    expect(selectChangedDeals(deals, prev, 0.2)).toEqual([]);
  });

  it("閾値を引き下げただけでは通知しない（前回スナップショットも現在の閾値で再判定するため）", () => {
    // 1000円 → 880円（12%off）。閾値 0.2 では対象外、0.1 なら対象。
    const target = item({ P_kindle: 880 });
    const deals = judge([target], 0.1);

    expect(deals).toHaveLength(1);
    // 過去の run に当時の閾値は残っていないため、前回スナップショットにも
    // 現在の閾値を適用する。結果として「閾値を下げた瞬間に対象化した商品」は
    // 次に価格が動くまで通知されない（既知の制約）。
    expect(selectChangedDeals(deals, previous(target), 0.1)).toEqual([]);
  });

  it("閾値を引き上げても、値下がりしていれば従来どおり通知する", () => {
    const deals = judge([item({ P_kindle: 500 })], 0.4);
    const prev = previous(item({ P_kindle: 550 }));

    expect(selectChangedDeals(deals, prev, 0.4)).toEqual(deals);
  });

  it("前回スナップショットの Kindle 価格が NULL なら前回非対象として通知する", () => {
    const deals = judge([item()], 0.2);
    // 抽出劣化などで前回は価格が取れていなかったケース。
    const prev = previous(item({ P_kindle: null }));

    expect(selectChangedDeals(deals, prev, 0.2)).toEqual(deals);
  });

  it("変化のあった商品だけを元の並び順で返す", () => {
    const unchanged = item({ url: "https://www.amazon.co.jp/dp/AAAAAAAAAA" });
    const cheaper = item({
      url: "https://www.amazon.co.jp/dp/BBBBBBBBBB",
      P_kindle: 600,
    });
    const deals = judge([unchanged, cheaper], 0.2);
    const prev = previous(
      unchanged,
      item({ url: "https://www.amazon.co.jp/dp/BBBBBBBBBB", P_kindle: 700 }),
    );

    const changed = selectChangedDeals(deals, prev, 0.2);

    expect(changed.map((d) => d.url)).toEqual([
      "https://www.amazon.co.jp/dp/BBBBBBBBBB",
    ]);
  });

  it("通知対象が0件なら空配列を返す", () => {
    expect(selectChangedDeals([], previous(item()), 0.2)).toEqual([]);
  });
});
