import os
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def generate_followup_question(jd_text: str, note_text: str, risk_level: str) -> str:
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    prompt = f"""
    Sei un AI interview copilot per recruiter italiani.

    JOB DESCRIPTION (estratto):
    {jd_text}

    CONTESTO DELLA CALL (note / segnali):
    {note_text}

    LIVELLO DI RISCHIO: {risk_level}

    Genera UNA sola domanda di follow-up in ITALIANO, pronta da fare a voce.
    Requisiti:
    - Deve essere TECNICA e incisiva.
    - Se il rischio è MEDIUM o HIGH, punta a verificare competenza "production-grade" (es. CI/CD, deploy, monitoring, rollback, incidenti, best practice).
    - Se il rischio è LOW, fai un approfondimento tecnico più avanzato.
    - Massimo 1 frase, niente prefazioni, niente spiegazioni.

    Rispondi SOLO con la domanda.
    """

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "Sei un intervistatore tecnico senior. Rispondi sempre e solo in italiano."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.4,
    )

    return response.choices[0].message.content.strip()
