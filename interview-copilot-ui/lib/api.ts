
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface Session {
  session_id: string;
  status: "live" | "completed";
  started_at: string;
  ended_at: string | null;
  candidate_id: string;
  candidate_name: string;
  jd_id: string;
  jd_title: string;
  coverage_score: number | null;
  notes_count: number;
  questions_asked_count: number;
}

export interface TimelineEvent {
  id: string;
  type: "note" | "question";
  author: string | null;
  text: string;
  asked_by: string | null;
  created_at: string;
}

export interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  linkedin_url: string | null;
}

export interface JobDescription {
  id: string;
  title: string;
  description_text: string;
}

export interface NextQuestionResponse {
  generated_next_question: string;
  best_preloaded_question: { question_text: string } | null;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  jd_similarity: number;
  signals: {
    chunks_are_reliable: boolean;
    best_preloaded_is_reliable: boolean;
  };
}

export interface RecapResponse {
  session: {
    session_id: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    candidate_id: string;
    job_description_id: string;
    candidate_name: string;
    jd_title: string;
  };
  coverage: {
    coverage_score: number;
    similarity: number;
  };
  notes: { author: string; note_text: string; created_at: string }[];
  questions: {
    asked: { question_text: string; asked_by: string; asked_at: string }[];
    unasked: { question_text: string }[];
  };
  llm_recap: {
    summary: string;
    strengths: string[];
    gaps_or_risks: string[];
    recommended_next_steps: string[];
  };
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = options;

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error ${res.status}: ${error}`);
  }

  return res.json();
}

// ─── SESSIONI ────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<{ sessions: Session[] }> {
  return apiFetch("/sessions/");
}

export async function startSession(
  candidate_id: string,
  job_description_id: string
): Promise<{ session_id: string }> {
  return apiFetch("/sessions/start/", {
    method: "POST",
    body: JSON.stringify({ candidate_id, job_description_id }),
  });
}

export async function endSession(session_id: string): Promise<void> {
  return apiFetch(`/sessions/${session_id}/end/`, { method: "POST", body: JSON.stringify({}) });
}

export async function getTimeline(
  session_id: string
): Promise<{ session_id: string; timeline: TimelineEvent[] }> {
  return apiFetch(`/sessions/${session_id}/timeline/`);
}

export async function getRecap(session_id: string): Promise<RecapResponse> {
  return apiFetch(`/sessions/${session_id}/recap/`);
}

// ─── NOTE ────────────────────────────────────────────────────────────────────

export async function addNote(
  session_id: string,
  note_text: string,
  author?: string
): Promise<{ note_id: string; risk_level: string; generated_followup_question: string }> {
  return apiFetch(`/sessions/${session_id}/notes/`, {
    method: "POST",
    body: JSON.stringify({ note_text, author: author || "" }),
  });
}

// ─── DOMANDE ─────────────────────────────────────────────────────────────────

export async function getNextQuestion(
  session_id: string,
  recruiter_id?: string
): Promise<NextQuestionResponse> {
  return apiFetch(`/sessions/${session_id}/next-question/`, {
    method: "POST",
    body: JSON.stringify({ recruiter_id: recruiter_id || "" }),
  });
}

export async function markQuestionAsked(
  question_id: string,
  asked_by?: string
): Promise<void> {
  return apiFetch(`/interview-questions/${question_id}/mark-asked/`, {
    method: "POST",
    body: JSON.stringify({ asked_by: asked_by || "" }),
  });
}

// ─── CANDIDATI ───────────────────────────────────────────────────────────────

export async function getCandidates(): Promise<{ results: Candidate[] }> {
  return apiFetch("/candidates/");
}

export async function createCandidate(
  full_name: string,
  email?: string
): Promise<Candidate> {
  return apiFetch("/candidates/", {
    method: "POST",
    body: JSON.stringify({ full_name, email: email || "" }),
  });
}

export async function uploadCV(
  candidate_id: string,
  file: File
): Promise<{ cv_id: string; chunks: number }> {
  const formData = new FormData();
  formData.append("candidate_id", candidate_id);
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/cvs/upload/`, {
    method: "POST",
    body: formData,
    // NON passiamo Content-Type: il browser lo imposta automaticamente con il boundary
  } as RequestInit);

  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}



export async function getJobDescriptions(): Promise<{ results: JobDescription[] }> {
  return apiFetch("/job-descriptions/");
}

export async function createJobDescription(
  title: string,
  description_text: string
): Promise<JobDescription> {
  return apiFetch("/job-descriptions/", {
    method: "POST",
    body: JSON.stringify({ title, description_text }),
  });
}

export async function getSessionDetail(session_id: string): Promise<Session> {
  const data = await apiFetch<{ sessions: Session[] }>("/sessions/");
  const session = data.sessions.find((s) => s.session_id === session_id);
  if (!session) throw new Error("Sessione non trovata");
  return session;
}

export async function getSessionCV(session_id: string): Promise<{ raw_text: string | null; file_url: string }> {
  return apiFetch(`/sessions/${session_id}/cv/`);
}

export async function getSessionQuestions(
  session_id: string,
  recruiter_id?: string
): Promise<{questions: any[]}> {
  const params = recruiter_id ? `?recruiter_id=${encodeURIComponent(recruiter_id)}` : "";
  return apiFetch(`/sessions/${session_id}/questions/${params}`);
}

// Estrae domande da testo plain — supporta formati:
// "1) domanda", "1. domanda", "- domanda", "• domanda"
export function parseQuestionsFromText(text: string): string[] {
  const lines = text.split("\n");
  const questions: string[] = [];

  for (const line of lines) {
    const cleaned = line
      .replace(/^\s*[\d]+[).]\s*/, "")  // rimuove "1)" o "1."
      .replace(/^\s*[-•]\s*/, "")        // rimuove "- " o "• "
      .trim();

    if (cleaned.length > 5) {  // ignora righe troppo corte
      questions.push(cleaned);
    }
  }

  return questions;
}

export async function parseQuestionsFromFile(file: File): Promise<{ questions: string[] }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/questions/parse-file/`, {
    method: "POST",
    body: formData,
  } as RequestInit);

  if (!res.ok) throw new Error(`Parse failed: ${res.status}`);
  return res.json();
}

export async function generateQuestionsFromCV(
  candidate_id: string,
  job_description_id: string
): Promise<{ questions: string[] }> {
  return apiFetch("/questions/generate/", {
    method: "POST",
    body: JSON.stringify({ candidate_id, job_description_id }),
  });
}

export async function createSessionQuestion(
  session_id: string,
  question_text: string,
  recruiter_id: string
): Promise<any> {
  return apiFetch(`/sessions/${session_id}/questions/`, {
    method: "POST",
    body: JSON.stringify({
      question_text,
      author: recruiter_id,
      recruiter_id
    }),
  });
}