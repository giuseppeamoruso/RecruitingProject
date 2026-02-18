import uuid

from rest_framework import viewsets
from sentence_transformers import SentenceTransformer

from .models import Candidato, CV, CVChunk, JobDescription, InterviewQuestion
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework import status
from rest_framework.generics import GenericAPIView

from .services.cv_pipeline import process_and_store_cv
from .serializers import (
    CandidatoSerializer,
    CVSerializer,
    CVChunkSerializer, CVUploadSerializer, ChunkSearchSerializer, JobDescriptionSerializer, CoverageExplainSerializer,
    InterviewQuestionSerializer, LiveSuggestSerializer, StartSessionSerializer, AddNoteSerializer,
    NextQuestionSerializer, SessionQuestionCreateSerializer, MarkAskedSerializer, EndSessionSerializer
)
from sentence_transformers import SentenceTransformer
from django.db import connection
from pgvector.psycopg2 import register_vector

from .services.llm_service import generate_followup_question


class CandidatoViewSet(viewsets.ModelViewSet):
    queryset = Candidato.objects.all()
    serializer_class = CandidatoSerializer


class CVViewSet(viewsets.ModelViewSet):
    queryset = CV.objects.all()
    serializer_class = CVSerializer


class CVChunkViewSet(viewsets.ModelViewSet):
    queryset = CVChunk.objects.all()
    serializer_class = CVChunkSerializer

class CVUploadView(GenericAPIView):
    serializer_class = CVUploadSerializer
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        candidate_id = str(serializer.validated_data["candidate_id"])
        pdf = serializer.validated_data["file"]

        if not pdf.name.lower().endswith(".pdf"):
            return Response({"error": "Only PDF files are supported"}, status=status.HTTP_400_BAD_REQUEST)

        result = process_and_store_cv(candidate_id=candidate_id, uploaded_file=pdf)
        return Response(result, status=status.HTTP_201_CREATED)

class ChunkSearchView(GenericAPIView):
    serializer_class = ChunkSearchSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        query_text = serializer.validated_data["query"]
        cv_id = serializer.validated_data.get("cv_id")
        top_k = serializer.validated_data["top_k"]

        # embedding query
        model = SentenceTransformer("all-MiniLM-L6-v2")
        query_vec = model.encode(query_text, normalize_embeddings=True).tolist()

        connection.ensure_connection()
        register_vector(connection.connection)

        with connection.cursor() as cur:
            if cv_id:
                cur.execute(
                    """
                    SELECT id, content, page_number, chunk_index,
                           embedding <=> (%s::vector) AS distance
                    FROM "CV_CHUNKS"
                    WHERE cv_id = %s
                    ORDER BY embedding <=> (%s::vector)
                    LIMIT %s
                    """,
                    [query_vec, str(cv_id), query_vec, top_k],
                )
            else:
                cur.execute(
                    """
                    SELECT id, content, page_number, chunk_index,
                           embedding <=> (%s::vector) AS distance
                    FROM "CV_CHUNKS"
                    ORDER BY embedding <=> (%s::vector)
                    LIMIT %s
                    """,
                    [query_vec, query_vec, top_k],
                )

            rows = cur.fetchall()

        results = [
            {
                "chunk_id": r[0],
                "content": r[1],
                "page_number": r[2],
                "chunk_index": r[3],
                "distance": float(r[4]),
            }
            for r in rows
        ]

        return Response({"results": results})

class JobDescriptionViewSet(viewsets.ModelViewSet):
    queryset = JobDescription.objects.all()
    serializer_class = JobDescriptionSerializer

    def perform_create(self, serializer):
        jd = serializer.save()

        model = SentenceTransformer("all-MiniLM-L6-v2")
        embedding = model.encode(
            jd.description_text,
            normalize_embeddings=True
        ).tolist()

        connection.ensure_connection()
        register_vector(connection.connection)

        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE "JOB_DESCRIPTIONS"
                SET embedding = %s
                WHERE id = %s
                """,
                [embedding, str(jd.id)]
            )

from .serializers import CoverageSerializer
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response
from django.db import connection
from pgvector.psycopg2 import register_vector


class CoverageView(GenericAPIView):
    serializer_class = CoverageSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cv_id = str(serializer.validated_data["cv_id"])
        jd_id = str(serializer.validated_data["job_description_id"])

        connection.ensure_connection()
        register_vector(connection.connection)

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT c.id,
                       jd.id,
                       (c.embedding <=> jd.embedding) AS distance
                FROM "CVS" c
                JOIN "JOB_DESCRIPTIONS" jd ON jd.id = %s
                WHERE c.id = %s
                """,
                [jd_id, cv_id],
            )
            row = cur.fetchone()

        if not row:
            return Response({"error": "CV or Job Description not found"}, status=404)

        distance = float(row[2])
        similarity = max(0.0, 1.0 - distance)
        coverage_score = round(similarity * 100, 2)

        return Response({
            "cv_id": cv_id,
            "job_description_id": jd_id,
            "distance": round(distance, 6),
            "similarity": round(similarity, 6),
            "coverage_score": coverage_score
        })




class CoverageExplainView(GenericAPIView):
    serializer_class = CoverageExplainSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cv_id = str(serializer.validated_data["cv_id"])
        jd_id = str(serializer.validated_data["job_description_id"])
        top_k = int(serializer.validated_data["top_k"])

        connection.ensure_connection()
        register_vector(connection.connection)

        with connection.cursor() as cur:
            # 1) Coverage macro (CV vs JD global)
            cur.execute(
                """
                SELECT (c.embedding <=> jd.embedding) AS distance
                FROM "CVS" c
                JOIN "JOB_DESCRIPTIONS" jd ON jd.id = %s
                WHERE c.id = %s
                """,
                [jd_id, cv_id],
            )
            row = cur.fetchone()

            if not row or row[0] is None:
                return Response({"error": "CV or JD not found, or missing embeddings"}, status=404)

            distance = float(row[0])
            similarity = max(0.0, 1.0 - distance)
            coverage_score = round(similarity * 100, 2)

            # 2) Evidence micro: top chunks in that CV closest to JD embedding
            cur.execute(
                """
                SELECT ch.id,
                       ch.content,
                       ch.page_number,
                       ch.chunk_index,
                       (ch.embedding <=> jd.embedding) AS distance
                FROM "CV_CHUNKS" ch
                JOIN "JOB_DESCRIPTIONS" jd ON jd.id = %s
                WHERE ch.cv_id = %s
                ORDER BY ch.embedding <=> jd.embedding
                LIMIT %s
                """,
                [jd_id, cv_id, top_k],
            )
            rows = cur.fetchall()

        evidence = [
            {
                "chunk_id": r[0],
                "content": r[1],
                "page_number": r[2],
                "chunk_index": r[3],
                "distance": float(r[4]),
            }
            for r in rows
        ]

        return Response({
            "cv_id": cv_id,
            "job_description_id": jd_id,
            "distance": round(distance, 6),
            "similarity": round(similarity, 6),
            "coverage_score": coverage_score,
            "top_chunks": evidence
        })


class InterviewQuestionViewSet(viewsets.ModelViewSet):
    queryset = InterviewQuestion.objects.all()
    serializer_class = InterviewQuestionSerializer

    def perform_create(self, serializer):
        q = serializer.save()

        model = SentenceTransformer("all-MiniLM-L6-v2")
        vec = model.encode(q.question_text, normalize_embeddings=True).tolist()

        connection.ensure_connection()
        register_vector(connection.connection)

        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE "INTERVIEW_QUESTIONS"
                SET embedding = %s
                WHERE id = %s
                """,
                [vec, str(q.id)],
            )

class LiveSuggestView(GenericAPIView):
    serializer_class = LiveSuggestSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cv_id = str(serializer.validated_data["cv_id"])
        jd_id = str(serializer.validated_data["job_description_id"])
        note_text = serializer.validated_data["note_text"]
        top_k = serializer.validated_data["top_k"]

        model = SentenceTransformer("all-MiniLM-L6-v2")
        note_vec = model.encode(note_text, normalize_embeddings=True).tolist()

        connection.ensure_connection()
        register_vector(connection.connection)

        with connection.cursor() as cur:

            # 1️⃣ Note vs JD (macro relevance)
            cur.execute(
                """
                SELECT (jd.embedding <=> %s::vector) AS distance
                FROM "JOB_DESCRIPTIONS" jd
                WHERE jd.id = %s
                """,
                [note_vec, jd_id],
            )
            jd_distance = float(cur.fetchone()[0])
            jd_similarity = max(0.0, 1.0 - jd_distance)

            # 2️⃣ Note vs CV chunks
            cur.execute(
                """
                SELECT ch.id, ch.content, ch.page_number,
                       (ch.embedding <=> %s::vector) AS distance
                FROM "CV_CHUNKS" ch
                WHERE ch.cv_id = %s
                ORDER BY ch.embedding <=> %s::vector
                LIMIT %s
                """,
                [note_vec, cv_id, note_vec, top_k],
            )
            chunk_rows = cur.fetchall()

            # 3️⃣ Note vs Preloaded Questions
            cur.execute(
                """
                SELECT q.id, q.question_text,
                       (q.embedding <=> %s::vector) AS distance
                FROM "INTERVIEW_QUESTIONS" q
                WHERE q.job_description_id = %s
                ORDER BY q.embedding <=> %s::vector
                LIMIT %s
                """,
                [note_vec, jd_id, note_vec, top_k],
            )
            question_rows = cur.fetchall()

        related_chunks = [
            {
                "chunk_id": r[0],
                "content": r[1],
                "page_number": r[2],
                "distance": float(r[3]),
            }
            for r in chunk_rows
        ]

        suggested_questions = [
            {
                "question_id": r[0],
                "question_text": r[1],
                "distance": float(r[2]),
            }
            for r in question_rows
        ]

        risk_flag = "LOW"
        if jd_similarity < 0.5:
            risk_flag = "MEDIUM"
        if jd_similarity < 0.3:
            risk_flag = "HIGH"
        # Recuperiamo testo JD
        with connection.cursor() as cur:
            cur.execute(
                'SELECT description_text FROM "JOB_DESCRIPTIONS" WHERE id = %s',
                [jd_id]
            )
            jd_text = cur.fetchone()[0]

        generated_question = generate_followup_question(
            jd_text=jd_text,
            note_text=note_text,
            risk_level=risk_flag
        )

        return Response({
            "jd_similarity": round(jd_similarity, 4),
            "risk_level": risk_flag,
            "related_cv_chunks": related_chunks,
            "suggested_preloaded_questions": suggested_questions,
            "generated_followup_question": generated_question,
            "note": note_text
        })

class StartSessionView(GenericAPIView):
    serializer_class = StartSessionSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session_id = str(uuid.uuid4())

        with connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "INTERVIEW_SESSIONS"
                (id, candidate_id, job_description_id, status, started_at)
                VALUES (%s, %s, %s, 'live', now())
                """,
                [
                    session_id,
                    str(serializer.validated_data["candidate_id"]),
                    str(serializer.validated_data["job_description_id"]),
                ],
            )

        return Response({"session_id": session_id})

class AddNoteView(GenericAPIView):
    serializer_class = AddNoteSerializer

    def post(self, request, session_id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        note_text = serializer.validated_data["note_text"]
        author = serializer.validated_data.get("author", "")

        model = SentenceTransformer("all-MiniLM-L6-v2")
        note_vec = model.encode(note_text, normalize_embeddings=True).tolist()

        connection.ensure_connection()
        register_vector(connection.connection)

        # Recupera JD collegata alla sessione
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT job_description_id
                FROM "INTERVIEW_SESSIONS"
                WHERE id = %s
                """,
                [session_id],
            )
            jd_id = cur.fetchone()[0]

        note_id = str(uuid.uuid4())

        # Salva nota
        with connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "INTERVIEW_NOTES"
                (id, session_id, author, note_text, embedding)
                VALUES (%s, %s, %s, %s, %s)
                """,
                [note_id, session_id, author, note_text, note_vec],
            )

        # Recupera testo JD
        with connection.cursor() as cur:
            cur.execute(
                'SELECT description_text FROM "JOB_DESCRIPTIONS" WHERE id = %s',
                [jd_id]
            )
            jd_text = cur.fetchone()[0]

        # Calcolo rischio
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT (embedding <=> %s::vector)
                FROM "JOB_DESCRIPTIONS"
                WHERE id = %s
                """,
                [note_vec, jd_id],
            )
            distance = float(cur.fetchone()[0])

        similarity = max(0.0, 1.0 - distance)

        risk_flag = "LOW"
        if similarity < 0.5:
            risk_flag = "MEDIUM"
        if similarity < 0.3:
            risk_flag = "HIGH"

        generated_question = generate_followup_question(
            jd_text=jd_text,
            note_text=note_text,
            risk_level=risk_flag
        )

        return Response({
            "note_id": note_id,
            "jd_similarity": round(similarity, 4),
            "risk_level": risk_flag,
            "generated_followup_question": generated_question
        })

def _avg_vectors(vectors):
    # vectors: list of list[float]
    if not vectors:
        return None
    dim = len(vectors[0])
    acc = [0.0] * dim
    for v in vectors:
        for i in range(dim):
            acc[i] += float(v[i])
    n = float(len(vectors))
    return [x / n for x in acc]


class NextBestQuestionView(GenericAPIView):
    serializer_class = NextQuestionSerializer

    def post(self, request, session_id, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        notes_window = int(serializer.validated_data["notes_window"])
        top_k_questions = int(serializer.validated_data["top_k_questions"])
        top_k_chunks = int(serializer.validated_data["top_k_chunks"])

        connection.ensure_connection()
        register_vector(connection.connection)

        model = SentenceTransformer("all-MiniLM-L6-v2")

        # 1) Recupera session: candidate_id + job_description_id
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT candidate_id, job_description_id
                FROM "INTERVIEW_SESSIONS"
                WHERE id = %s
                """,
                [str(session_id)],
            )
            sess = cur.fetchone()
            if not sess:
                return Response({"error": "Session not found"}, status=404)
            candidate_id, jd_id = sess[0], sess[1]

        # 2) Recupera CV attivo del candidato
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM "CVS"
                WHERE candidate_id = %s AND is_active = true
                ORDER BY created_at DESC NULLS LAST
                LIMIT 1
                """,
                [str(candidate_id)],
            )
            row = cur.fetchone()
            if not row:
                return Response({"error": "Active CV not found for candidate"}, status=404)
            cv_id = row[0]

        # 3) Recupera ultime note + embeddings
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT note_text, embedding
                FROM "INTERVIEW_NOTES"
                WHERE session_id = %s
                ORDER BY created_at DESC NULLS LAST
                LIMIT %s
                """,
                [str(session_id), notes_window],
            )
            note_rows = cur.fetchall()

        # note_texts in ordine cronologico (dal più vecchio al più nuovo)
        note_texts = [r[0] for r in reversed(note_rows)]
        note_vecs = [r[1] for r in note_rows if r[1] is not None]

        context_vec = _avg_vectors(note_vecs)

        # 4) Se non ci sono note, usa JD come contesto
        with connection.cursor() as cur:
            cur.execute(
                'SELECT description_text, embedding FROM "JOB_DESCRIPTIONS" WHERE id = %s',
                [str(jd_id)],
            )
            jd_row = cur.fetchone()
            if not jd_row:
                return Response({"error": "Job Description not found"}, status=404)
            jd_text, jd_vec = jd_row[0], jd_row[1]

        if context_vec is None:
            # fallback: embedding dal testo JD (se embedding null, lo calcoliamo al volo)
            if jd_vec is not None:
                context_vec = jd_vec
            else:
                context_vec = model.encode(jd_text, normalize_embeddings=True).tolist()

        # 5) Similarità contesto ↔ JD (rischio)
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT (embedding <=> %s::vector)
                FROM "JOB_DESCRIPTIONS"
                WHERE id = %s
                """,
                [context_vec, str(jd_id)],
            )
            dist = cur.fetchone()[0]
            jd_distance = float(dist) if dist is not None else 1.0

        jd_similarity = max(0.0, 1.0 - jd_distance)
        risk_flag = "LOW"
        if jd_similarity < 0.5:
            risk_flag = "MEDIUM"
        if jd_similarity < 0.3:
            risk_flag = "HIGH"

        # 6) Best preloaded questions (prima session_id se esiste, poi fallback JD)
        with connection.cursor() as cur:
            # prova prima domande legate alla sessione (se colonna esiste e hai popolato)
            try:
                cur.execute(
                    """
                    SELECT id, question_text, (embedding <=> %s::vector) AS distance
                    FROM "INTERVIEW_QUESTIONS"
                    WHERE session_id = %s
                      AND asked_at IS NULL
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                    """,
                    [context_vec, str(session_id), context_vec, top_k_questions],
                )
                q_rows = cur.fetchall()
            except Exception:
                q_rows = []

            if not q_rows:
                cur.execute(
                    """
                    SELECT id, question_text, (embedding <=> %s::vector) AS distance
                    FROM "INTERVIEW_QUESTIONS"
                    WHERE job_description_id = %s
                      AND asked_at IS NULL
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                    """,
                    [context_vec, str(jd_id), context_vec, top_k_questions],
                )
                q_rows = cur.fetchall()

        suggested_questions = [
            {"question_id": r[0], "question_text": r[1], "distance": float(r[2])}
            for r in q_rows
        ]
        best_preloaded = suggested_questions[0] if suggested_questions else None

        # 7) Evidence chunks dal CV (contestualizzati alle note)
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, content, page_number, chunk_index,
                       (embedding <=> %s::vector) AS distance
                FROM "CV_CHUNKS"
                WHERE cv_id = %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                [context_vec, str(cv_id), context_vec, top_k_chunks],
            )
            ch_rows = cur.fetchall()

        evidence_chunks = [
            {
                "chunk_id": r[0],
                "content": r[1],
                "page_number": r[2],
                "chunk_index": r[3],
                "distance": float(r[4]),
            }
            for r in ch_rows
        ]
        CHUNK_MAX_DISTANCE = 0.58
        QUESTION_MAX_DISTANCE = 0.60

        # filtra chunk rumorosi
        filtered_chunks = [c for c in evidence_chunks if c["distance"] <= CHUNK_MAX_DISTANCE]

        # se tutti rumorosi, restituisci lista vuota + flag
        chunks_are_reliable = len(filtered_chunks) > 0

        # best preloaded affidabile solo sotto soglia
        best_is_reliable = best_preloaded is not None and best_preloaded["distance"] <= QUESTION_MAX_DISTANCE

        if not best_is_reliable:
            best_preloaded = None  # così in UI appare "nessuna domanda precaricata rilevante"

        # 8) Generazione “next question” con contesto (note + JD + (opzionale) best preloaded)
        # Creiamo un note_text di contesto (ultime note)
        context_notes_text = "\n".join([f"- {t}" for t in note_texts]) if note_texts else "- (nessuna nota ancora)"

        # Se abbiamo una best preloaded, la passiamo come hint dentro la nota (senza cambiare firma servizio)
        note_for_llm = (
            f"Contesto call (ultime note):\n{context_notes_text}\n\n"
            f"Domanda precaricata più vicina (se utile):\n"
            f"{best_preloaded['question_text'] if best_preloaded else '(nessuna)'}\n"
        )
        already_suggested = "\n".join([f"- {q['question_text']}" for q in suggested_questions]) or "- (nessuna)"
        note_for_llm += f"\nDomande già suggerite/precaricate (evita duplicati):\n{already_suggested}\n"

        generated_next = generate_followup_question(
            jd_text=jd_text,
            note_text=note_for_llm,
            risk_level=risk_flag,
        )

        return Response({
            "session_id": str(session_id),
            "candidate_id": str(candidate_id),
            "cv_id": str(cv_id),
            "job_description_id": str(jd_id),
            "jd_similarity": round(jd_similarity, 4),
            "risk_level": risk_flag,
            "context_notes": note_texts,
            "best_preloaded_question": best_preloaded,
            "suggested_preloaded_questions": suggested_questions,
            "evidence_chunks": filtered_chunks,
            "signals": {
                "chunks_are_reliable": chunks_are_reliable,
                "best_preloaded_is_reliable": best_is_reliable,
                "chunk_max_distance": CHUNK_MAX_DISTANCE,
                "question_max_distance": QUESTION_MAX_DISTANCE
            },
            "generated_next_question": generated_next,
        })

class SessionQuestionsView(GenericAPIView):
    serializer_class = SessionQuestionCreateSerializer

    def get(self, request, session_id):
        connection.ensure_connection()
        register_vector(connection.connection)

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, question_text, asked_at, asked_by, created_at
                FROM "INTERVIEW_QUESTIONS"
                WHERE session_id = %s
                ORDER BY created_at DESC NULLS LAST
                """,
                [str(session_id)],
            )
            rows = cur.fetchall()

        return Response({
            "session_id": str(session_id),
            "questions": [
                {
                    "question_id": r[0],
                    "question_text": r[1],
                    "asked_at": r[2],
                    "asked_by": r[3],
                    "created_at": r[4],
                    "is_asked": r[2] is not None,
                }
                for r in rows
            ],
        })

    def post(self, request, session_id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        question_text = serializer.validated_data["question_text"]
        author = serializer.validated_data.get("author", "")

        connection.ensure_connection()
        register_vector(connection.connection)

        # ricava job_description_id dalla sessione
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT job_description_id
                FROM "INTERVIEW_SESSIONS"
                WHERE id = %s
                """,
                [str(session_id)],
            )
            row = cur.fetchone()
            if not row:
                return Response({"error": "Session not found"}, status=404)
            jd_id = row[0]

        model = SentenceTransformer("all-MiniLM-L6-v2")
        vec = model.encode(question_text, normalize_embeddings=True).tolist()

        q_id = str(uuid.uuid4())

        with connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "INTERVIEW_QUESTIONS"
                (id, session_id, job_description_id, question_text, embedding, created_at)
                VALUES (%s, %s, %s, %s, %s, now())
                """,
                [q_id, str(session_id), str(jd_id), question_text, vec],
            )

        return Response({
            "question_id": q_id,
            "session_id": str(session_id),
            "question_text": question_text,
            "author": author
        }, status=201)


class MarkQuestionAskedView(GenericAPIView):
    serializer_class = MarkAskedSerializer

    def post(self, request, question_id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        asked_by = serializer.validated_data.get("asked_by", "")

        connection.ensure_connection()

        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE "INTERVIEW_QUESTIONS"
                SET asked_at = now(),
                    asked_by = %s
                WHERE id = %s
                RETURNING id, asked_at, asked_by
                """,
                [asked_by, str(question_id)],
            )
            row = cur.fetchone()

        if not row:
            return Response({"error": "Question not found"}, status=404)

        return Response({
            "question_id": row[0],
            "asked_at": row[1],
            "asked_by": row[2],
        })

class EndSessionView(GenericAPIView):
    serializer_class = EndSessionSerializer

    def post(self, request, session_id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        connection.ensure_connection()

        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE "INTERVIEW_SESSIONS"
                SET status = 'completed',
                    ended_at = now()
                WHERE id = %s
                RETURNING id, status, started_at, ended_at
                """,
                [str(session_id)],
            )
            row = cur.fetchone()

        if not row:
            return Response({"error": "Session not found"}, status=404)

        return Response({
            "session_id": row[0],
            "status": row[1],
            "started_at": row[2],
            "ended_at": row[3],
        })

class SessionRecapView(GenericAPIView):
    def get(self, request, session_id):
        connection.ensure_connection()
        register_vector(connection.connection)

        # 1) session info
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT candidate_id, job_description_id, status, started_at, ended_at
                FROM "INTERVIEW_SESSIONS"
                WHERE id = %s
                """,
                [str(session_id)],
            )
            sess = cur.fetchone()
            if not sess:
                return Response({"error": "Session not found"}, status=404)

        candidate_id, jd_id, status, started_at, ended_at = sess

        # 2) CV attivo
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM "CVS"
                WHERE candidate_id = %s AND is_active = true
                ORDER BY created_at DESC NULLS LAST
                LIMIT 1
                """,
                [str(candidate_id)],
            )
            row = cur.fetchone()
            if not row:
                return Response({"error": "Active CV not found"}, status=404)
            cv_id = row[0]

        # 3) JD text + embedding
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT title, description_text
                FROM "JOB_DESCRIPTIONS"
                WHERE id = %s
                """,
                [str(jd_id)],
            )
            jd_row = cur.fetchone()
            if not jd_row:
                return Response({"error": "Job Description not found"}, status=404)
            jd_title, jd_text = jd_row

        # 4) Coverage (macro)
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT (c.embedding <=> jd.embedding) AS distance
                FROM "CVS" c
                JOIN "JOB_DESCRIPTIONS" jd ON jd.id = %s
                WHERE c.id = %s
                """,
                [str(jd_id), str(cv_id)],
            )
            row = cur.fetchone()
            if not row or row[0] is None:
                return Response({"error": "Missing embeddings for coverage"}, status=400)

        distance = float(row[0])
        similarity = max(0.0, 1.0 - distance)
        coverage_score = round(similarity * 100, 2)

        # 5) Coverage explain: top chunks CV vs JD
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT ch.id, ch.content, ch.page_number, ch.chunk_index,
                       (ch.embedding <=> jd.embedding) AS distance
                FROM "CV_CHUNKS" ch
                JOIN "JOB_DESCRIPTIONS" jd ON jd.id = %s
                WHERE ch.cv_id = %s
                ORDER BY ch.embedding <=> jd.embedding
                LIMIT 5
                """,
                [str(jd_id), str(cv_id)],
            )
            chunk_rows = cur.fetchall()

        top_chunks = [
            {
                "chunk_id": r[0],
                "content": r[1],
                "page_number": r[2],
                "chunk_index": r[3],
                "distance": float(r[4]),
            }
            for r in chunk_rows
        ]

        # 6) Notes timeline
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT author, note_text, created_at
                FROM "INTERVIEW_NOTES"
                WHERE session_id = %s
                ORDER BY created_at ASC NULLS LAST
                """,
                [str(session_id)],
            )
            note_rows = cur.fetchall()

        notes = [
            {"author": r[0], "note_text": r[1], "created_at": r[2]}
            for r in note_rows
        ]

        # 7) Questions asked / unasked (session-scoped)
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, question_text, asked_at, asked_by, created_at
                FROM "INTERVIEW_QUESTIONS"
                WHERE session_id = %s
                ORDER BY created_at ASC NULLS LAST
                """,
                [str(session_id)],
            )
            q_rows = cur.fetchall()

        asked = []
        unasked = []
        for r in q_rows:
            item = {
                "question_id": r[0],
                "question_text": r[1],
                "asked_at": r[2],
                "asked_by": r[3],
                "created_at": r[4],
            }
            (asked if r[2] is not None else unasked).append(item)

        # 8) LLM recap (strengths/gaps/summary)
        # Costruiamo un contesto compatto
        notes_text = "\n".join([f"- {n['note_text']}" for n in notes]) or "- (nessuna nota)"
        asked_text = "\n".join([f"- {q['question_text']}" for q in asked]) or "- (nessuna)"
        unasked_text = "\n".join([f"- {q['question_text']}" for q in unasked]) or "- (nessuna)"

        recap_prompt = f"""
SESSION RECAP REQUEST

Job title: {jd_title}

Coverage score: {coverage_score}%

NOTES (timeline):
{notes_text}

QUESTIONS ASKED:
{asked_text}

QUESTIONS NOT ASKED:
{unasked_text}

Produce un recap in ITALIANO con questo formato JSON (solo JSON, niente testo extra):
{{
  "summary": "...",
  "strengths": ["...", "...", "..."],
  "gaps_or_risks": ["...", "...", "..."],
  "recommended_next_steps": ["...", "..."]
}}
"""
        # Usiamo lo stesso helper che già hai, ma qui vogliamo JSON: facciamo una funzione rapida inline
        from openai import OpenAI
        import os
        client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Sei un recruiter tecnico senior. Rispondi sempre e solo in italiano. Output solo JSON valido."},
                {"role": "user", "content": recap_prompt},
            ],
            temperature=0.3,
        )
        llm_json = resp.choices[0].message.content.strip()
        import json

        try:
            llm_recap = json.loads(llm_json)
        except Exception:
            llm_recap = {
                "summary": llm_json,
                "strengths": [],
                "gaps_or_risks": [],
                "recommended_next_steps": []
            }
        return Response({
            "session": {
                "session_id": str(session_id),
                "status": status,
                "started_at": started_at,
                "ended_at": ended_at,
                "candidate_id": str(candidate_id),
                "cv_id": str(cv_id),
                "job_description_id": str(jd_id),
            },
            "coverage": {
                "distance": round(distance, 6),
                "similarity": round(similarity, 6),
                "coverage_score": coverage_score,
                "top_chunks": top_chunks,
            },
            "notes": notes,
            "questions": {
                "asked": asked,
                "unasked": unasked,
            },
            "llm_recap": llm_recap
        })
