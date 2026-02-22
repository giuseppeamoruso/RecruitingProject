"use client";

import {useEffect, useState} from "react";
import { useRouter } from "next/navigation";
import {
  getCandidates,
  createCandidate,
  uploadCV,
  getJobDescriptions,
  createJobDescription,
  startSession,
  Candidate,
  JobDescription,
  generateQuestionsFromCV,
  apiFetch, parseQuestionsFromFile, createSessionQuestion,
} from "@/lib/api";
import {useAuth} from "@/lib/AuthContext";

type Step = "candidate" | "jd" | "questions" | "confirm";

export default function NewSessionPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("candidate");
  const { user } = useAuth();
  // Candidato
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);

  // JD
  const [jobDescriptions, setJobDescriptions] = useState<JobDescription[]>([]);
  const [selectedJd, setSelectedJd] = useState<JobDescription | null>(null);
  const [newJdTitle, setNewJdTitle] = useState("");
  const [newJdText, setNewJdText] = useState("");
  const [loadingJds, setLoadingJds] = useState(false);
  const [jdsLoaded, setJdsLoaded] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionInputs, setQuestionInputs] = useState<string[]>(["", "", ""]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  // Carica candidati automaticamente all'avvio dello step
  useEffect(() => {
    if (step === "candidate") {
      loadCandidates();
    }
    if (step === "jd") {
      loadJds();
    }
  }, [step]);
  // ── Step 1: carica candidati ──
  const loadCandidates = async () => {
  if (candidatesLoaded) return;
  setLoadingCandidates(true);
  try {
    const data = await getCandidates();
    const list = Array.isArray(data) ? data : (data.results ?? []);
    setCandidates(list);
    setCandidatesLoaded(true);
  } catch (e: any) {
    setError(e.message);
  } finally {
    setLoadingCandidates(false);
  }
};

  const handleCandidateNext = async () => {
    setError(null);
    setLoading(true);
    try {
      let candidate = selectedCandidate;

      // Se non ha selezionato un candidato esistente, ne crea uno nuovo
      if (!candidate) {
        if (!newName.trim()) { setError("Inserisci il nome del candidato"); setLoading(false); return; }
        candidate = await createCandidate(newName.trim(), newEmail.trim());
        setSelectedCandidate(candidate);
      }

      // Se ha caricato un CV, lo processa
      if (cvFile) {
        await uploadCV(candidate.id, cvFile);
      }

      setStep("jd");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: carica JD ──
  const loadJds = async () => {
  if (jdsLoaded) return;
  setLoadingJds(true);
  try {
    const data = await getJobDescriptions();
    const list = Array.isArray(data) ? data : (data.results ?? []);
    setJobDescriptions(list);
    setJdsLoaded(true);
  } catch (e: any) {
    setError(e.message);
  } finally {
    setLoadingJds(false);
  }
};

  const handleQuestionsNext = async () => {
  setError(null);
  setLoading(true);
  try {
    // Filtra le domande vuote e le salva nel backend
    const validQuestions = questionInputs.filter((q) => q.trim());
    setStep("confirm");
  } catch (e: any) {
    setError(e.message);
  } finally {
    setLoading(false);
  }
};

  const handleJdNext = async () => {
    setError(null);
    setLoading(true);
    try {
      let jd = selectedJd;

      if (!jd) {
        if (!newJdTitle.trim() || !newJdText.trim()) {
          setError("Inserisci titolo e testo della Job Description");
          setLoading(false);
          return;
        }
        jd = await createJobDescription(newJdTitle.trim(), newJdText.trim());
        setSelectedJd(jd);
      }

      setQuestionInputs(["", "", ""]);  // ← aggiungi questa riga
      setStep("questions");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: avvia sessione ──
 const handleStart = async () => {
  if (!selectedCandidate || !selectedJd) return;
  setLoading(true);
  setError(null);
  try {
    const { session_id } = await startSession(selectedCandidate.id, selectedJd.id);

    // Salva le domande pre-caricate nella sessione appena creata
    const validQuestions = questionInputs.filter((q) => q.trim());
    await Promise.all(
  validQuestions.map((q) =>
    createSessionQuestion(session_id, q.trim(), user?.uid || "anonymous")
  )
);

    router.push(`/sessions/${session_id}`);
  } catch (e: any) {
    setError(e.message);
  } finally {
    setLoading(false);
  }
};

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-8 py-5 flex items-center gap-4">
        <button onClick={() => router.push("/")} className="text-gray-400 hover:text-white text-sm transition-colors">
          ← Home
        </button>
        <h1 className="text-xl font-semibold">Nuova Sessione</h1>
      </div>

      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* Progress steps */}
        {(["candidate", "jd", "questions", "confirm"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
              ${step === s ? "bg-indigo-600 text-white" :
                (["candidate", "jd", "questions", "confirm"].indexOf(step) > i) ? "bg-green-600 text-white" :
                "bg-gray-800 text-gray-500"}`}>
              {i + 1}
            </div>
            <span className={`text-sm ${step === s ? "text-white" : "text-gray-500"}`}>
              {s === "candidate" ? "Candidato" : s === "jd" ? "Job Description" : s === "questions" ? "Domande" : "Conferma"}
            </span>
            {i < 3 && <span className="text-gray-700 mx-1">→</span>}
          </div>
        ))}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm mb-6">
            {error}
          </div>
        )}

        {/* ── STEP 1: Candidato ── */}
        {step === "candidate" && (
          <div className="space-y-6" >
            <h2 className="text-lg font-medium">Seleziona candidato</h2>

            {/* Candidati esistenti */}
            {loadingCandidates && <p className="text-gray-400 text-sm">Caricamento candidati...</p>}
            {candidates.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Candidati esistenti:</p>
                {candidates.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => { setSelectedCandidate(c); setNewName(""); setNewEmail(""); }}
                    className={`px-4 py-3 rounded-lg border cursor-pointer transition-colors
                      ${selectedCandidate?.id === c.id
                        ? "border-indigo-500 bg-indigo-900/20"
                        : "border-gray-700 bg-gray-900 hover:border-gray-600"}`}
                  >
                    <p className="font-medium">{c.full_name}</p>
                    {c.email && <p className="text-sm text-gray-400">{c.email}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Nuovo candidato */}
            <div className="border-t border-gray-800 pt-6 space-y-3">
              <p className="text-sm text-gray-400">Oppure crea nuovo:</p>
              <input
                type="text"
                placeholder="Nome completo *"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setSelectedCandidate(null); }}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
              <input
                type="email"
                placeholder="Email (opzionale)"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Upload CV */}
            <div className="border-t border-gray-800 pt-6 space-y-3">
              <p className="text-sm text-gray-400">
                {selectedCandidate ? "Carica CV aggiornato (opzionale):" : "Carica CV (PDF, opzionale):"}
              </p>
              {selectedCandidate && !cvFile && (
                <p className="text-xs text-green-400">✓ CV esistente nel sistema verrà utilizzato</p>
              )}
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                className="text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:cursor-pointer hover:file:bg-indigo-500"
              />
              {cvFile && <p className="text-xs text-green-400">✓ {cvFile.name} (verrà usato questo)</p>}
            </div>

            <button
              onClick={handleCandidateNext}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors px-4 py-3 rounded-lg font-medium"
            >
              {loading ? "Elaborazione..." : "Avanti →"}
            </button>
          </div>
        )}

        {/* ── STEP 2: Job Description ── */}
        {step === "jd" && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium">Seleziona o crea una Job Description</h2>

            {loadingJds && <p className="text-gray-400 text-sm">Caricamento JD...</p>}
            {jobDescriptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Job Description esistenti:</p>
                {jobDescriptions.map((jd) => (
                  <div
                    key={jd.id}
                    onClick={() => { setSelectedJd(jd); setNewJdTitle(""); setNewJdText(""); }}
                    className={`px-4 py-3 rounded-lg border cursor-pointer transition-colors
                      ${selectedJd?.id === jd.id
                        ? "border-indigo-500 bg-indigo-900/20"
                        : "border-gray-700 bg-gray-900 hover:border-gray-600"}`}
                  >
                    <p className="font-medium">{jd.title}</p>
                    <p className="text-sm text-gray-400 truncate">{jd.description_text.slice(0, 80)}...</p>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-gray-800 pt-6 space-y-3">
              <p className="text-sm text-gray-400">Oppure crea nuova:</p>
              <input
                type="text"
                placeholder="Titolo posizione *"
                value={newJdTitle}
                onChange={(e) => { setNewJdTitle(e.target.value); setSelectedJd(null); }}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
              <textarea
                placeholder="Descrizione completa della posizione *"
                value={newJdText}
                onChange={(e) => { setNewJdText(e.target.value); setSelectedJd(null); }}
                rows={6}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("candidate")}
                className="flex-1 bg-gray-800 hover:bg-gray-700 transition-colors px-4 py-3 rounded-lg font-medium"
              >
                ← Indietro
              </button>
              <button
                onClick={handleJdNext}
                disabled={loading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors px-4 py-3 rounded-lg font-medium"
              >
                {loading ? "Elaborazione..." : "Avanti →"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Domande pre-caricate ── */}
          {step === "questions" && (
            <div className="space-y-6">
              <h2 className="text-lg font-medium">Domande pre-caricate</h2>
              <p className="text-sm text-gray-400">
                Carica un file con le domande oppure inseriscile manualmente.
              </p>

              {/* Upload file */}
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-gray-300">📄 Carica da file (.txt o .docx)</p>
                <p className="text-xs text-gray-500">Formato supportato: "1) domanda", "- domanda", "• domanda"</p>
                <input
                  type="file"
                  accept=".txt,.docx"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setLoadingQuestions(true);
                    try {
                      const data = await parseQuestionsFromFile(file);
                      if (data.questions.length > 0) {
                        setQuestionInputs(data.questions);
                      }
                    } catch (err) {
                      setError("Errore nel parsing del file");
                    } finally {
                      setLoadingQuestions(false);
                    }
                  }}
                  className="text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-700 file:text-white file:cursor-pointer hover:file:bg-gray-600"
                />
                {loadingQuestions && <p className="text-xs text-indigo-400">Parsing in corso...</p>}
              </div>

              {/* Genera dal CV */}
              {selectedCandidate && selectedJd && (
                <div className="bg-indigo-900/20 border border-indigo-800 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-medium text-indigo-300">Genera domande dal CV</p>
                  <p className="text-xs text-gray-500">
                    L'AI analizza il CV di {selectedCandidate.full_name} e la JD "{selectedJd.title}"
                    e genera domande tecniche mirate.
                  </p>
                  <button
                    onClick={async () => {
                      setLoadingQuestions(true);
                      setError(null);
                      try {
                        const data = await generateQuestionsFromCV(
                          selectedCandidate.id,
                          selectedJd.id
                        );
                        if (data.questions.length > 0) {
                          setQuestionInputs(data.questions);
                        }
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setLoadingQuestions(false);
                      }
                    }}
                    disabled={loadingQuestions}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    {loadingQuestions ? "Generazione in corso..." : "Genera 5 domande"}
                  </button>
                </div>
              )}

              {/* Domande manuali */}
              <div className="space-y-3">
                <p className="text-sm text-gray-400">Oppure inserisci manualmente:</p>
                {questionInputs.map((q, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-gray-500 text-sm pt-2.5 shrink-0">{i + 1}.</span>
                    <input
                      type="text"
                      placeholder={`Domanda ${i + 1} (opzionale)`}
                      value={q}
                      onChange={(e) => {
                        const updated = [...questionInputs];
                        updated[i] = e.target.value;
                        setQuestionInputs(updated);
                      }}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                    {questionInputs.length > 1 && (
                      <button
                        onClick={() => setQuestionInputs(questionInputs.filter((_, idx) => idx !== i))}
                        className="text-gray-600 hover:text-red-400 text-sm px-2 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
                <button
                  onClick={() => setQuestionInputs([...questionInputs, ""])}
                  className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  + Aggiungi domanda
                </button>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep("jd")}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 transition-colors px-4 py-3 rounded-lg font-medium"
                  >
                    ← Indietro
                  </button>
                  <button
                    onClick={handleQuestionsNext}
                    disabled={loading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors px-4 py-3 rounded-lg font-medium"
                  >
                    {loading ? "..." : "Avanti →"}
                  </button>
                </div>
              </div>
            )}

        {/* ── STEP 4: Conferma ── */}
        {step === "confirm" && selectedCandidate && selectedJd && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium">Conferma e avvia</h2>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Candidato</p>
                <p className="font-medium">{selectedCandidate.full_name}</p>
                {selectedCandidate.email && <p className="text-sm text-gray-400">{selectedCandidate.email}</p>}
              </div>
              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Job Description</p>
                <p className="font-medium">{selectedJd.title}</p>
                <p className="text-sm text-gray-400 mt-1 line-clamp-3">{selectedJd.description_text}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("jd")}
                className="flex-1 bg-gray-800 hover:bg-gray-700 transition-colors px-4 py-3 rounded-lg font-medium"
              >
                ← Indietro
              </button>
              <button
                onClick={handleStart}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 transition-colors px-4 py-3 rounded-lg font-medium"
              >
                {loading ? "Avvio..." : "Avvia Sessione"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}


