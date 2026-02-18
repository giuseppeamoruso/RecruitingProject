import os
import uuid
from typing import List, Tuple

import pdfplumber
from sentence_transformers import SentenceTransformer
from supabase import create_client

from django.db import connection, transaction

from pgvector.psycopg2 import register_vector


def sanitize_text(s: str) -> str:
    if not s:
        return ""
    # PostgreSQL non accetta NUL (0x00) nelle stringhe
    s = s.replace("\x00", "")
    return s


def chunk_text(text: str, chunk_size: int = 900, overlap: int = 120) -> List[Tuple[int, str]]:
    text = (text or "").strip()
    if not text:
        return []

    chunks = []
    start = 0
    idx = 0
    step = max(1, chunk_size - overlap)

    while start < len(text):
        chunk = text[start:start + chunk_size].strip()
        if chunk:
            chunks.append((idx, chunk))
            idx += 1
        start += step

    return chunks


def extract_text_by_page(pdf_path: str):
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            txt = sanitize_text((page.extract_text() or "")).strip()
            if txt:
                pages.append((i, txt))
    return pages



def _get_supabase():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def process_and_store_cv(candidate_id: str, uploaded_file) -> dict:
    """
    Pipeline:
    1) Upload PDF -> Supabase Storage
    2) Parse PDF -> text per page
    3) Global embedding -> CVS.embedding (vector(384))
    4) Chunk per page + embeddings -> CV_CHUNKS.embedding (vector(384))
    """
    bucket = os.environ.get("SUPABASE_BUCKET", "cvs")
    model_name = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

    model = SentenceTransformer(model_name)
    supabase = _get_supabase()

    # ---- Save to temp (works on Windows too) ----
    tmp_path = os.path.join(os.getcwd(), f"tmp_{uuid.uuid4()}.pdf")
    with open(tmp_path, "wb") as f:
        for c in uploaded_file.chunks():
            f.write(c)

    # ---- Upload to storage ----
    storage_path = f"{candidate_id}/{uuid.uuid4()}.pdf"
    with open(tmp_path, "rb") as f:
        data = f.read()

    supabase.storage.from_(bucket).upload(
        path=storage_path,
        file=data,
        file_options={"content-type": "application/pdf"},
    )
    file_url = supabase.storage.from_(bucket).get_public_url(storage_path)

    # ---- Parse ----
    pages = extract_text_by_page(tmp_path)
    raw_text = sanitize_text("\n\n".join(t for _, t in pages)).strip()

    # ---- Embeddings (normalize ok for cosine) ----
    global_vec = model.encode(raw_text or " ", normalize_embeddings=True).tolist()  # 384

    cv_id = str(uuid.uuid4())

    # ---- Insert into Postgres (Supabase) ----
    with transaction.atomic():
        connection.ensure_connection()
        register_vector(connection.connection)

        with connection.cursor() as cur:
            # (Optional) ensure only 1 active CV per candidate
            cur.execute(
                'UPDATE "CVS" SET is_active = false WHERE candidate_id = %s',
                [candidate_id],
            )

            # Insert CVS (includes vector(384))
            cur.execute(
                """
                INSERT INTO "CVS" (id, candidate_id, file_url, raw_text, embedding, is_active)
                VALUES (%s, %s, %s, %s, %s, true)
                """,
                [cv_id, candidate_id, file_url, raw_text, global_vec],
            )

            total_chunks = 0
            for page_number, page_text in pages:
                for chunk_index, content in chunk_text(page_text):
                    content = sanitize_text(content)
                    vec = model.encode(content or " ", normalize_embeddings=True).tolist()
                    chunk_id = str(uuid.uuid4())

                    cur.execute(
                        """
                        INSERT INTO "CV_CHUNKS" (id, cv_id, content, page_number, chunk_index, embedding)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        [chunk_id, cv_id, content, page_number, chunk_index, vec],
                    )
                    total_chunks += 1

    try:
        os.remove(tmp_path)
    except Exception:
        pass

    return {
        "cv_id": cv_id,
        "candidate_id": candidate_id,
        "file_url": file_url,
        "pages": len(pages),
        "chunks": total_chunks,
        "embedding_dim": len(global_vec),
        "model": model_name,
    }
