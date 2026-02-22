"use client";

import { useEffect, useState } from "react";
import { getSessions, Session } from "@/lib/api";
import SessionCard from "@/components/SessionCard";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { logout } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const filteredSessions = sessions
    .filter((s) =>
      search === "" ||
      s.candidate_name.toLowerCase().includes(search.toLowerCase()) ||
      s.jd_title.toLowerCase().includes(search.toLowerCase())
    );

  const visibleSessions = showAll ? filteredSessions : filteredSessions.slice(0, 3);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading]);

  useEffect(() => {
    getSessions()
      .then((data) => setSessions(data.sessions))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (authLoading) return (
    <main className="h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-500 text-sm">Caricamento...</p>
    </main>
  );

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Interview Copilot</h1>
        </div>
        <div className="flex items-center gap-4">
          {/* Utente loggato */}
          <div className="flex items-center gap-2">
            {user?.photoURL && (
              <img src={user.photoURL} className="w-7 h-7 rounded-full" alt="avatar" />
            )}
            <span className="text-xs text-gray-400">{user?.displayName}</span>
          </div>
          <button
            onClick={async () => { await logout(); router.push("/login"); }}
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            Esci
          </button>
          <Link
            href="/sessions/new"
            className="bg-indigo-600 hover:bg-indigo-500 transition-colors px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Nuova Sessione
          </Link>
        </div>
      </div>

      {/* Contenuto */}
        <div className="max-w-4xl mx-auto px-8 py-10">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
            Sessioni recenti
          </h2>

          {/* Barra di ricerca */}
          {sessions.length > 0 && (
            <div className="mb-4">
              <input
                type="text"
                placeholder="Cerca per candidato o posizione..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowAll(true); }}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-gray-300 placeholder-gray-600"
              />
            </div>
          )}

          {loading && <p className="text-gray-500 text-sm">Caricamento...</p>}

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm">
              Errore: {error}
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div className="text-center py-20 text-gray-500">
              <p className="text-lg">Nessuna sessione ancora.</p>
              <p className="text-sm mt-1">Crea la tua prima sessione per iniziare.</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {visibleSessions.map((session) => (
              <SessionCard key={session.session_id} session={session} />
            ))}
          </div>

          {filteredSessions.length > 3 && search === "" && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-4 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {showAll ? "Mostra meno ↑" : `Mostra tutte (${filteredSessions.length}) ↓`}
            </button>
          )}
        </div>
    </main>
  );
}