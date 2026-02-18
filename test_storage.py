import os
import uuid
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = os.environ.get("SUPABASE_BUCKET", "cvs")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

local_pdf_path = "CV - Giuseppe Amoruso-2.pdf"  # metti un pdf qui nella root o cambia path
remote_path = f"debug/{uuid.uuid4()}.pdf"

with open(local_pdf_path, "rb") as f:
    data = f.read()

res = supabase.storage.from_(BUCKET).upload(
    path=remote_path,
    file=data,
    file_options={"content-type": "application/pdf"},
)

print("UPLOAD RESPONSE:", res)

public_url = supabase.storage.from_(BUCKET).get_public_url(remote_path)
print("PUBLIC URL:", public_url)
