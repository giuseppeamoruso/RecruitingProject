import os
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def generate_followup_question(jd_text: str, note_text: str, risk_level: str, cv_chunks: list = None) -> str:
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    chunks_context = ""
    if cv_chunks:
        chunks_context = "\n\nESTRATTI RILEVANTI DAL CV:\n" + "\n---\n".join(cv_chunks[:3])

    prompt = f"""
    Sei un intervistatore tecnico senior specializzato in recruiting IT.

    JOB DESCRIPTION (estratto):
    {jd_text[:1000]}
    {chunks_context}

    CONTESTO DELLA CALL (note / segnali):
    {note_text}

    LIVELLO DI RISCHIO: {risk_level}

    Genera UNA sola domanda di follow-up in ITALIANO, pronta da fare a voce.
    Requisiti:
    - Deve essere SPECIFICA rispetto a ciò che ha appena detto il candidato.
    - Deve collegare quello che ha detto con le competenze richieste dalla JD.
    - Se nel CV ci sono esperienze rilevanti, fai riferimento a quelle specificamente.
    - Se il rischio è MEDIUM o HIGH, verifica competenze production-grade.
    - Massimo 1 frase, niente prefazioni.

    Rispondi SOLO con la domanda.
    """

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Sei un intervistatore tecnico senior. Rispondi sempre e solo in italiano."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.4,
            timeout=10,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        fallbacks = {
            "HIGH": "Puoi descrivere un sistema che hai messo in produzione e come hai gestito un incidente critico?",
            "MEDIUM": "Come garantiresti la qualità del codice in un team distribuito con CI/CD?",
            "LOW": "Qual è la scelta architetturale di cui sei più soddisfatto negli ultimi 12 mesi?",
        }
        return fallbacks.get(risk_level, "Puoi raccontarmi un progetto tecnico complesso che hai gestito?")
