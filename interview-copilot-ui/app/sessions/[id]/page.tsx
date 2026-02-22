"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getTimeline,
  addNote,
  getNextQuestion,
  endSession,
  getSessionDetail,
  getSessionCV,
  getSessionQuestions,
  TimelineEvent,
  createSessionQuestion,
  parseQuestionsFromFile,
  apiFetch,
} from "@/lib/api";
import CVViewer from "@/components/CVViewer";
import RiskChart from "@/components/RiskChart";
import JitsiMeet from "@/components/JitsiMeet";
import {useAuth} from "@/lib/AuthContext";
export const dynamic = "force-dynamic";
interface Question {
  question_id: string;
  question_text: string;
  is_asked: boolean;
  asked_at: string | null;
}

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const jitsiRoom = `interview-copilot-${id.slice(0, 8)}`;
  const jitsiUrl = `https://meet.jit.si/${jitsiRoom}`;
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [cvText, setCvText] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [noteText, setNoteText] = useState("");
  const [author, setAuthor] = useState("");
  const { user } = useAuth();
  const [loadingNote, setLoadingNote] = useState(false);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [lastSuggestion, setLastSuggestion] = useState<string | null>(null);
  const [lastRisk, setLastRisk] = useState<"LOW" | "MEDIUM" | "HIGH" | null>(null);
  const [ending, setEnding] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [riskPoints, setRiskPoints] = useState<{ time: string; risk: number; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<"cv" | "notes">("cv");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [rightTab, setRightTab] = useState<"questions" | "add">("questions");
  const [newQuestion, setNewQuestion] = useState("");
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  useEffect(() => {
    if (user?.displayName) setAuthor(user.displayName);
  }, [user]);
  useEffect(() => {
    getTimeline(id).then((t) => setTimeline(t.timeline));
    getSessionDetail(id).then((s) => {
      if (s.status === "completed") setSessionEnded(true);
    });
    getSessionCV(id).then((data) => setCvText(data.raw_text));
    getSessionQuestions(id, user?.uid || "").then((data) => setQuestions(data.questions));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline]);

  useEffect(() => {
  if (sessionEnded) return;

  const interval = setInterval(() => {
    getTimeline(id).then((t) => setTimeline(t.timeline));
    getSessionQuestions(id, user?.uid || "").then((data) => setQuestions(data.questions));
  }, 2000);

  return () => clearInterval(interval);
}, [id, sessionEnded]);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;

    const optimisticText = noteText.trim();
    const optimisticId = `optimistic-${Date.now()}`;

    // Nota ottimistica — appare subito
    const optimisticEvent: TimelineEvent = {
      id: optimisticId,
      type: "note",
      author,
      text: optimisticText,
      asked_by: null,
      created_at: new Date().toISOString(),
    };
    setTimeline((prev) => [...prev, optimisticEvent]);
    setNoteText("");
    setLoadingNote(true);
    setError(null);

    try {
      const res = await addNote(id, optimisticText, author);

      // Sostituisci la nota ottimistica con quella reale
      setTimeline((prev) =>
        prev.map((e) =>
          e.id === optimisticId ? { ...e, id: res.note_id } : e
        )
      );

      setLastSuggestion(res.generated_followup_question);
      setLastRisk(res.risk_level as "LOW" | "MEDIUM" | "HIGH");

      const riskValue = res.risk_level === "HIGH" ? 80 : res.risk_level === "MEDIUM" ? 50 : 20;
      setRiskPoints((prev) => [...prev, {
        time: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
        risk: riskValue,
        label: optimisticText.slice(0, 30),
      }]);

    } catch (e: any) {
      // Rimuovi la nota ottimistica se c'è un errore
      setTimeline((prev) => prev.filter((e) => e.id !== optimisticId));
      setNoteText(optimisticText);
      setError(e.message);
    } finally {
      setLoadingNote(false);
    }
  };

   const handleMarkAsked = async (question_id: string) => {
        try {
          await apiFetch(`/sessions/${id}/questions/${question_id}/mark-asked/`, {
            method: "POST",
          });
          getSessionQuestions(id, user?.uid || "").then((data) => setQuestions(data.questions));
        } catch (e: any) {
          setError(e.message);
        }
      };

  const handleNextQuestion = async () => {
    setLoadingQuestion(true);
    setError(null);
    try {
      const res = await getNextQuestion(id, user?.uid || "");
      setLastSuggestion(res.generated_next_question);
      setLastRisk(res.risk_level);
      getSessionQuestions(id, user?.uid || "").then((data) => setQuestions(data.questions));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingQuestion(false);
    }
  };




      const handleEnd = async () => {
      setShowEndModal(false);
      setEnding(true);
      try {
        await endSession(id);
        setSessionEnded(true);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setEnding(false);
      }
    };
  const handleAddQuestion = async () => {
  if (!newQuestion.trim()) return;
  setAddingQuestion(true);
  try {
    await createSessionQuestion(id, newQuestion.trim(), user?.uid || "");
    setNewQuestion("");
    getSessionQuestions(id, user?.uid || "").then((data) => setQuestions(data.questions));
    setRightTab("questions");
  } catch (e: any) {
    setError(e.message);
  } finally {
    setAddingQuestion(false);
  }
};

  const riskColor = {
    LOW: "text-green-400 bg-green-900/20 border-green-800",
    MEDIUM: "text-yellow-400 bg-yellow-900/20 border-yellow-800",
    HIGH: "text-red-400 bg-red-900/20 border-red-800",
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  const notes = timeline.filter((e) => e.type === "note");

  return (
    <main className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/")} className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Home
          </button>
          {!sessionEnded ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="text-xs font-medium text-gray-500">COMPLETATA</span>
          )}
          <p className="text-sm text-gray-500 font-mono">{id.slice(0, 8)}...</p>
        </div>
        <div className="flex items-center gap-3">
          {sessionEnded && (
            <button
              onClick={() => router.push(`/sessions/${id}/recap`)}
              className="bg-indigo-600 hover:bg-indigo-500 transition-colors px-4 py-2 rounded-lg text-sm font-medium"
            >
              📋 Vedi Recap
            </button>
          )}
          {!sessionEnded && (
            <button
              onClick={() => setShowEndModal(true)}
              disabled={ending}
              className="bg-red-900/40 hover:bg-red-800/60 border border-red-800 transition-colors px-4 py-2 rounded-lg text-sm font-medium text-red-300 disabled:opacity-50"
            >
              {ending ? "Chiusura..." : "■ Fine Sessione"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Colonna sinistra: CV + Note tab ── */}
        <div className="w-72 border-r border-gray-800 flex flex-col shrink-0">
          {/* Tab switcher */}
          <div className="flex border-b border-gray-800 shrink-0">
            <button
              onClick={() => setLeftTab("cv")}
              className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors
                ${leftTab === "cv"
                  ? "text-white border-b-2 border-indigo-500"
                  : "text-gray-500 hover:text-gray-300"}`}
            >
              CV Candidato
            </button>
            <button
              onClick={() => setLeftTab("notes")}
              className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors
                ${leftTab === "notes"
                  ? "text-white border-b-2 border-indigo-500"
                  : "text-gray-500 hover:text-gray-300"}`}
            >
              Note {notes.length > 0 && `(${notes.length})`}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {/* Tab CV */}
            {leftTab === "cv" && (
              <>
                {!cvText && <p className="text-xs text-gray-600">Nessun CV caricato.</p>}
                {cvText && <CVViewer text={cvText} />}
              </>
            )}

            {/* Tab Note */}
            {leftTab === "notes" && (
              <div className="space-y-3">
                {notes.length === 0 && (
                  <p className="text-xs text-gray-600">Nessuna nota ancora.</p>
                )}
                {notes.map((note) => (
                  <div key={note.id} className="border-l-2 border-indigo-800 pl-3">
                    <p className="text-xs text-gray-500 mb-0.5">
                      {note.author} · {formatTime(note.created_at)}
                    </p>
                    <p className="text-xs text-gray-300 leading-relaxed">{note.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

          {/* ── Colonna centrale: Jitsi full + input in basso ── */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  <div className="flex-1 relative min-h-0 overflow-hidden">
                    {!sessionEnded ? (
                      <div className="absolute inset-0">
                        <JitsiMeet roomName={jitsiRoom} displayName={user?.displayName || "Recruiter"} />
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-gray-600 text-sm">Sessione terminata — chiamata chiusa.</p>
                      </div>
                    )}
                    {/* Link invito — solo se sessione attiva */}
                    {!sessionEnded && (
                      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 bg-gray-950/80 backdrop-blur rounded-lg px-3 py-1.5 z-10">
                        <span className="text-xs text-gray-400 truncate flex-1">🔗 {jitsiUrl}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(jitsiUrl)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors shrink-0 font-medium"
                        >
                          Copia link
                        </button>
                      </div>
                    )}
                  </div>
              {!sessionEnded ? (
                <div className="border-t border-gray-800 px-6 py-3 shrink-0 space-y-2 bg-gray-950">
                  {lastSuggestion && (
                    <div className={`border rounded-lg px-4 py-3 text-sm ${lastRisk ? riskColor[lastRisk] : "border-gray-700 text-gray-300"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium uppercase tracking-wider opacity-70">
                          💡 Suggerimento AI {lastRisk && `· Rischio ${lastRisk}`}
                        </span>
                        <button onClick={() => setLastSuggestion(null)} className="text-xs opacity-50 hover:opacity-100">✕</button>
                      </div>
                      <p>{lastSuggestion}</p>
                    </div>
                  )}
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        placeholder="Il tuo nome (es. Tech Lead)"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-gray-400"
                      />
                      <textarea
                        placeholder="Aggiungi una nota... (Invio per inviare)"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}
                        rows={2}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                      />
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={handleAddNote}
                        disabled={!noteText.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors px-4 py-2.5 rounded-lg text-sm font-medium"
                      >
                        {loadingNote ? "⏳" : "Invia"}
                      </button>
                      <button
                        onClick={handleNextQuestion}
                        disabled={loadingQuestion}
                        className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 transition-colors px-4 py-2.5 rounded-lg text-sm font-medium"
                      >
                        {loadingQuestion ? "..." : "Genera domanda"}
                      </button>
                    </div>
                  </div>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                </div>
              ) : (
                <div className="border-t border-gray-800 px-6 py-4 shrink-0 bg-gray-950 text-center">
                  <p className="text-sm text-gray-500">Sessione terminata</p>
                </div>
              )}

            </div>

        {/* ── Colonna destra: Grafico + Domande ── */}
<div className="w-72 border-l border-gray-800 flex flex-col shrink-0">
  <RiskChart points={riskPoints} />

  {lastSuggestion && (
    <div className={`mx-3 mt-3 border rounded-lg px-3 py-2 text-xs ${lastRisk ? riskColor[lastRisk] : "border-gray-700 text-gray-400"}`}>
      <p className="font-medium mb-1 opacity-70">💡 Domanda suggerita</p>
      <p className="leading-relaxed">{lastSuggestion}</p>
    </div>
  )}

  {/* Tab switcher */}
  <div className="flex border-b border-gray-800 mt-3 shrink-0">
    <button
      onClick={() => setRightTab("questions")}
      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors
        ${rightTab === "questions" ? "text-white border-b-2 border-indigo-500" : "text-gray-500 hover:text-gray-300"}`}
    >
      Domande {questions.length > 0 && `(${questions.length})`}
    </button>
    {!sessionEnded && (
      <button
        onClick={() => setRightTab("add")}
        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors
          ${rightTab === "add" ? "text-white border-b-2 border-indigo-500" : "text-gray-500 hover:text-gray-300"}`}
      >
        + Aggiungi
      </button>
    )}
  </div>

  {/* Tab domande */}
  {rightTab === "questions" && (
    <div className="flex-1 overflow-y-auto px-4 space-y-2 py-3">
      {questions.length === 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-600">Nessuna domanda caricata.</p>
          {!sessionEnded && (
            <button
              onClick={() => setRightTab("add")}
              className="w-full bg-gray-800 hover:bg-gray-700 transition-colors px-3 py-2 rounded-lg text-xs text-gray-300"
            >
              + Aggiungi domande
            </button>
          )}
        </div>
      )}
      {questions.map((q) => (
          <div
            key={q.question_id}
            onClick={() => !q.is_asked && !sessionEnded && handleMarkAsked(q.question_id)}
            className={`rounded-lg px-3 py-2.5 border text-xs leading-relaxed transition-colors
              ${q.is_asked
                ? "border-green-500 bg-green-900/10 text-gray-500 cursor-default"
                : "border-gray-700 bg-gray-900 text-gray-300 cursor-pointer hover:border-indigo-500"}`}
          >
            {q.is_asked && (
              <span className="text-green-500 font-medium block mb-0.5">✓ Fatta</span>
            )}
            {!q.is_asked && !sessionEnded && (
              <span className="text-gray-600 font-medium block mb-0.5 text-xs">Clicca per segnare come fatta</span>
            )}
            <span>{q.question_text}</span>
          </div>
        ))}
    </div>
  )}

        {/* Tab aggiungi domanda */}
        {rightTab === "add" && (
          <div className="flex-1 px-4 py-3 space-y-3">
            <p className="text-xs text-gray-500">
              Aggiungi domande visibili solo a te durante la call.
            </p>

            {/* Upload file */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 space-y-2">
              <p className="text-xs text-gray-400">📄 Carica da file (.txt o .docx)</p>
              <input
                type="file"
                accept=".txt,.docx"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setAddingQuestion(true);
                  try {
                    const data = await parseQuestionsFromFile(file);
                    if (data.questions.length > 0) {
                      // Salva tutte le domande direttamente
                      await Promise.all(
                        data.questions.map((q) =>
                          createSessionQuestion(id, q, user?.uid || "")
                        )
                      );
                      getSessionQuestions(id, user?.uid || "").then((d) => setQuestions(d.questions));
                      setRightTab("questions");
                    }
                  } catch (e: any) {
                    setError("Errore nel parsing del file");
                  } finally {
                    setAddingQuestion(false);
                  }
                }}
                className="text-xs text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-700 file:text-white file:cursor-pointer hover:file:bg-gray-600"
              />
              {addingQuestion && <p className="text-xs text-indigo-400">Caricamento...</p>}
            </div>

            {/* Oppure manuale */}
            <p className="text-xs text-gray-600">Oppure scrivi manualmente:</p>
            <textarea
              placeholder="Scrivi la tua domanda..."
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAddQuestion();
                }
              }}
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRightTab("questions")}
                className="flex-1 bg-gray-800 hover:bg-gray-700 transition-colors px-3 py-2 rounded-lg text-xs"
              >
                Annulla
              </button>
              <button
                onClick={handleAddQuestion}
                disabled={!newQuestion.trim() || addingQuestion}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors px-3 py-2 rounded-lg text-xs font-medium"
              >
                {addingQuestion ? "..." : "Salva"}
              </button>
            </div>
          </div>
        )}
      </div>

      </div>
      {showEndModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h2 className="text-lg font-semibold text-white">Termina sessione?</h2>
            <p className="text-sm text-gray-400">
              Assicurati di aver chiuso anche la chiamata Jitsi prima di terminare la sessione.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowEndModal(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 transition-colors px-4 py-2 rounded-lg text-sm"
              >
                Annulla
              </button>
              <button
                onClick={handleEnd}
                className="flex-1 bg-red-700 hover:bg-red-600 transition-colors px-4 py-2 rounded-lg text-sm font-medium text-white"
              >
                Termina
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}