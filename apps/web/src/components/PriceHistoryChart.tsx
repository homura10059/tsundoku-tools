import type { PriceSnapshot } from "@tsundoku-tools/shared";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  snapshots: PriceSnapshot[];
};

export function PriceHistoryChart({ snapshots }: Props) {
  const data = snapshots.map((s) => ({
    date: new Date(s.scrapedAt).toLocaleDateString("ja-JP", {
      month: "numeric",
      day: "numeric",
    }),
    price: s.priceJpy,
    points: s.points,
  }));

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="font-semibold mb-4">価格履歴</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis
            yAxisId="price"
            orientation="left"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `¥${v.toLocaleString()}`}
          />
          <YAxis yAxisId="points" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number, name: string) =>
              name === "price" ? [`¥${value.toLocaleString()}`, "価格"] : [`${value}pt`, "ポイント"]
            }
          />
          <Legend formatter={(value: string) => (value === "price" ? "価格" : "ポイント")} />
          <Line
            yAxisId="price"
            type="stepAfter"
            dataKey="price"
            stroke="#2563eb"
            dot={false}
            strokeWidth={2}
          />
          <Line
            yAxisId="points"
            type="stepAfter"
            dataKey="points"
            stroke="#16a34a"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
