"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getRecap, RecapResponse } from "@/lib/api";
import CoverageBar from "@/components/CoverageBar";

export default function RecapPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecap(id)
      .then(setRecap)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("it-IT") : "—";

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-8 py-5 flex items-center gap-4">
        <button
          onClick={() => router.push(`/sessions/${id}`)}
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          ← Torna alla sessione
        </button>
        <h1 className="text-xl font-semibold">Recap Sessione</h1>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
        {loading && <p className="text-gray-400">Generazione recap in corso...</p>}
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {recap && (


          <>
            {/* Info candidato e JD */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Candidato</p>
                  <p className="text-xl font-semibold">{recap.session.candidate_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Posizione</p>
                  <p className="text-lg font-medium text-indigo-400">{recap.session.jd_title}</p>
                </div>
              </div>
            {/* Coverage */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
                Coverage Score
              </h2>
              <div className="flex items-end gap-4">
                <p className="text-5xl font-bold">{recap.coverage.coverage_score}%</p>
                <div className="flex-1 pb-2">
                  <CoverageBar score={recap.coverage.coverage_score} />
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                Avviata: {formatDate(recap.session.started_at)} →
                Terminata: {formatDate(recap.session.ended_at)}
              </div>
            </div>

            {/* LLM Summary */}
            {recap.llm_recap.summary && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
                  Sintesi
                </h2>
                <p className="text-gray-200 leading-relaxed">{recap.llm_recap.summary}</p>
              </div>
            )}

            {/* Strengths + Gaps */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-green-900 rounded-xl p-6">
                <h2 className="text-sm font-medium text-green-400 uppercase tracking-wider mb-3">
                  ✓ Punti di forza
                </h2>
                <ul className="space-y-2">
                  {recap.llm_recap.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                      <span className="text-green-500 shrink-0">•</span>
                      {s}
                    </li>
                  ))}
                  {recap.llm_recap.strengths.length === 0 && (
                    <li className="text-sm text-gray-600">Nessuno rilevato</li>
                  )}
                </ul>
              </div>

              <div className="bg-gray-900 border border-red-900 rounded-xl p-6">
                <h2 className="text-sm font-medium text-red-400 uppercase tracking-wider mb-3">
                  ✗ Gap / Rischi
                </h2>
                <ul className="space-y-2">
                  {recap.llm_recap.gaps_or_risks.map((g, i) => (
                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                      <span className="text-red-500 shrink-0">•</span>
                      {g}
                    </li>
                  ))}
                  {recap.llm_recap.gaps_or_risks.length === 0 && (
                    <li className="text-sm text-gray-600">Nessuno rilevato</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Next steps */}
            {recap.llm_recap.recommended_next_steps.length > 0 && (
              <div className="bg-gray-900 border border-indigo-900 rounded-xl p-6">
                <h2 className="text-sm font-medium text-indigo-400 uppercase tracking-wider mb-3">
                  → Prossimi step consigliati
                </h2>
                <ul className="space-y-2">
                  {recap.llm_recap.recommended_next_steps.map((s, i) => (
                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                      <span className="text-indigo-400 shrink-0">{i + 1}.</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Domande fatte */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
                Domande fatte ({recap.questions.asked.length})
              </h2>
              {recap.questions.asked.length === 0 && (
                <p className="text-sm text-gray-600">Nessuna domanda registrata</p>
              )}
              <ul className="space-y-2">
                {recap.questions.asked.map((q, i) => (
                  <li key={i} className="text-sm text-gray-300 flex gap-2">
                    <span className="text-indigo-400 shrink-0">Q{i + 1}.</span>
                    {q.question_text}
                  </li>
                ))}
              </ul>
            </div>

            {/* Note timeline */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
                Note della call ({recap.notes.length})
              </h2>
              {recap.notes.length === 0 && (
                <p className="text-sm text-gray-600">Nessuna nota</p>
              )}
              <div className="space-y-3">
                {recap.notes.map((n, i) => (
                  <div key={i} className="border-l-2 border-gray-700 pl-4">
                    <p className="text-xs text-gray-500 mb-1">
                      {n.author || "Anonimo"} · {formatDate(n.created_at)}
                    </p>
                    <p className="text-sm text-gray-300">{n.note_text}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}