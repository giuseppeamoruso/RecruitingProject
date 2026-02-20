export default function CoverageBar({ score }: { score: number }) {
  // Colore della barra in base allo score
  const color =
    score >= 70 ? "bg-green-500" :
    score >= 45 ? "bg-yellow-500" :
    "bg-red-500";

  return (
    <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(score, 100)}%` }}
      />
    </div>
  );
}