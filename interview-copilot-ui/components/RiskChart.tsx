"use client";

interface RiskPoint {
  time: string;
  risk: number;
  label: string;
}

interface RiskChartProps {
  points: RiskPoint[];
}

export default function RiskChart({ points }: RiskChartProps) {
  if (points.length === 0) return null;

  const max = 100;
  const width = 100;
  const height = 60;
  const padding = 4;

  const getY = (risk: number) =>
    height - padding - ((risk / max) * (height - padding * 2));

  const getX = (i: number) =>
    points.length === 1
      ? width / 2
      : padding + (i / (points.length - 1)) * (width - padding * 2);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(p.risk)}`)
    .join(" ");

  const lastPoint = points[points.length - 1];
  const avgRisk = Math.round(points.reduce((a, b) => a + b.risk, 0) / points.length);

  const color =
    avgRisk >= 70 ? "#f87171" :
    avgRisk >= 40 ? "#facc15" :
    "#4ade80";

  return (
    <div className="px-4 py-3 border-b border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          Andamento Call
        </h2>
        <span className={`text-xs font-bold ${
          avgRisk >= 70 ? "text-red-400" :
          avgRisk >= 40 ? "text-yellow-400" :
          "text-green-400"
        }`}>
          Rischio medio {avgRisk}%
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-12">
        {/* Linee guida */}
        <line x1={padding} y1={getY(70)} x2={width - padding} y2={getY(70)}
          stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
        <line x1={padding} y1={getY(40)} x2={width - padding} y2={getY(40)}
          stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />

        {/* Area sotto la curva */}
        <path
          d={`${pathD} L ${getX(points.length - 1)} ${height} L ${getX(0)} ${height} Z`}
          fill={color}
          fillOpacity="0.1"
        />

        {/* Linea */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Ultimo punto */}
        <circle cx={getX(points.length - 1)} cy={getY(lastPoint.risk)} r="2" fill={color} />
      </svg>

      <div className="flex justify-between text-xs text-gray-700 mt-1">
        <span>LOW</span>
        <span>{points.length} eventi</span>
        <span>HIGH</span>
      </div>
    </div>
  );
}