import Link from "next/link";
import { Session } from "@/lib/api";
import CoverageBar from "./CoverageBar";

export default function SessionCard({ session }: { session: Session }) {
  const isLive = session.status === "live";

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Link href={`/sessions/${session.session_id}`}>
      <div className="bg-gray-900 border border-gray-800 hover:border-indigo-700 transition-colors rounded-xl px-6 py-4 cursor-pointer">
        <div className="flex items-start justify-between gap-4">
          {/* Info principale */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {/* Badge status */}
              {isLive ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="text-xs font-medium text-gray-500">COMPLETATA</span>
              )}
            </div>

            <p className="font-medium text-white truncate">{session.candidate_name}</p>
            <p className="text-sm text-gray-400 truncate">{session.jd_title}</p>
          </div>

          {/* Coverage score */}
          <div className="text-right shrink-0">
            {session.coverage_score !== null ? (
              <div>
                <p className="text-2xl font-bold text-white">{session.coverage_score}%</p>
                <p className="text-xs text-gray-500">coverage</p>
                <div className="mt-1 w-24">
                  <CoverageBar score={session.coverage_score} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">— %</p>
            )}
          </div>
        </div>

        {/* Footer card */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
          <span>{formatDate(session.started_at)}</span>
          <span>{session.notes_count} note</span>
          <span>{session.questions_asked_count} domande fatte</span>
        </div>
      </div>
    </Link>
  );
}