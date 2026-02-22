Interview Copilot
Premessa
Nella mia esperienza lavorativa ho spesso ricoperto anche il ruolo di stakeholder, ritrovandomi in call dove si ripetevano spesso le stesse domande, ci si dimenticava cosa chiedere, non ci si appuntava correttamente l’informazione. Data quindi la richiesta, ho pensato di strutturare un sistema che fosse in grado di dare ai recruiter tutto ciò che serve per intervistare al meglio in candidato: cv e domande a portata di mano( con la possibilità di farle generare dall’AI stessa), note ( con annessa elaborazione di domande da parte dell’AI con studio dell’andamento della call) e recap finale. 
Cosa fa il sistema
Interview Copilot è strutturato come una web application con tre pannelli affiancati nella schermata di chiamata:

•	Pannello sinistro: visualizzazione del CV del candidato con parsing automatico del testo, affiancato da un tab delle note prese durante la call.
•	Pannello centrale: videochiamata embedded via Jitsi Meet, con link condivisibile al candidato e area di input per note e azioni AI.
•	Pannello destro: domande pre-caricate dal recruiter, grafico di andamento del rischio calcolato nota per nota, e suggerimento dinamico della prossima domanda generato dall'AI.

Il flusso completo di utilizzo prevede quattro step: creazione o selezione del candidato con upload del CV, selezione o creazione della Job Description, caricamento o generazione AI delle domande per la sessione, e avvio della call. Al termine, il sistema produce un recap automatico con coverage score, punti di forza, gap rilevati e step consigliati.

Stack tecnologico
Backend — Django e Django REST Framework
Il backend è costruito con Django 5 e Django REST Framework. La scelta di Django non è stata casuale: la sua solidità nella gestione dei modelli dati, il sistema di migrations e la flessibilità nell'uso di raw SQL tramite connection.cursor() lo rendono ideale per un progetto che interagisce con un database preesistente senza poterne modificare lo schema arbitrariamente.

Tutte le viste sono class-based views che ereditano da APIView o GenericAPIView, organizzate in candidates/views.py. Le API principali esposte sono:



•	GET/POST /api/sessions/ — lista e creazione sessioni
•	POST /api/sessions/{id}/notes/ — aggiunta nota con analisi AI
•	POST /api/sessions/{id}/next-question/ — generazione domanda contestuale
•	GET /api/sessions/{id}/recap/ — riepilogo finale con LLM
•	POST /api/questions/parse-file/ — parsing domande da file .txt o .docx

La comunicazione con il database avviene interamente tramite raw SQL su PostgreSQL (Supabase), senza ORM Django per le tabelle principali.
I modelli Django sono definiti con “managed=False” per rispettare lo schema esistente. Questa scelta ha permesso di usare funzionalità avanzate come pgvector per la ricerca semantica tramite distanza coseno tra embeddings.

AI e modelli locali
Per contenere i costi e garantire la privacy dei dati, il sistema usa modelli locali per le operazioni più frequenti:

•	sentence-transformers/all-MiniLM-L6-v2, modello leggero (384 dimensioni) per generare gli embeddings di CV, chunks e Job Description. Viene caricato una sola volta in memoria tramite un singleton get_embedding_model() per evitare reload a ogni richiesta.
•	DistilBERT (via transformers)  per la sentiment analysis delle note in tempo reale, classificando ogni nota come LOW, MEDIUM o HIGH risk.
•	GPT-4o-mini via OpenAI API, usato esclusivamente per la generazione di domande contestuali e per il recap finale, dove la qualità del testo è prioritaria rispetto al costo.

Il sistema di question generation funziona in due fasi: 
prima recupera i top 3 CV chunks più simili semanticamente all'ultima nota del recruiter, 
poi li passa insieme alla Job Description e alla nota stessa a GPT-4o-mini per generare una domanda di follow-up contestuale e pertinente.

Database — Supabase e pgvector
Il database è PostgreSQL ospitato su Supabase con l'estensione pgvector abilitata. 
Ho scelto di utilizzare pgvector per semplificare l’architettura oltre a diminuire l’overhead operativo.
Le tabelle principali sono 
CANDIDATI, 
CVS, 
CV_CHUNKS, 
JOB_DESCRIPTIONS, 
INTERVIEW_SESSIONS, 
INTERVIEW_QUESTIONS e INTERVIEW_NOTES.




Gli embeddings vengono salvati come vettori float[] nella colonna embedding di ogni tabella. Le query di similarità usano l'operatore <=> di pgvector per il calcolo della distanza coseno, permettendo ricerche semantiche efficienti sia per il coverage score che per il recupero dei chunk contestuali.

Il coverage score è calcolato come "coverage=(1−cosined​istance(CVe​mbedding,JDe​mbedding))∗100"
 
questo restituisce una percentuale normalizzata che rappresenta l’allineamento semantico tra CV del candidato e Job Description e questo approccio privilegia l’allineamento semantico rispetto al semplice matching di keyword.
Frontend — Next.js e TypeScript
Il frontend è costruito con Next.js 14 in modalità App Router, con TypeScript e Tailwind CSS per lo styling. L'architettura è interamente client-side per le pagine di sessione, usando useState e useEffect per la gestione dello stato locale.

Il polling real-time  per aggiornare timeline e domande ogni 2 secondi durante la call  è implementato con setInterval all'interno di un useEffect con cleanup automatico. Questa scelta, rispetto a WebSocket, è più semplice da implementare e mantenere per un sistema multi-recruiter dove la sincronia non deve essere al millisecondo.

L'autenticazione è gestita tramite Firebase Authentication con Google OAuth. Il token di sessione viene salvato in un cookie (firebase-session) e verificato dal middleware Next.js per proteggere tutte le route. Ogni recruiter vede solo le proprie domande pre-caricate, filtrate per recruiter_id (uid Firebase), mentre le note sono condivise tra tutti i recruiter della stessa sessione.

La videochiamata è integrata tramite Jitsi Meet External API, che permette di embeddare una stanza Jitsi direttamente nel pannello centrale senza gestire alcuna infrastruttura WebRTC. Il candidato riceve semplicemente un link alla stanza e si connette dal browser senza installare nulla.

Principi Architetturali
•	LLM come layer finale: i Large Language Models vengono utilizzati solo per la generazione di testo ad alto valore (domande contestuali e recap), mentre retrieval semantico, scoring e logica applicativa restano deterministici e locali.
•	AI cost-aware: embeddings e sentiment analysis vengono eseguiti localmente per ridurre costi e latenza.
•	Separazione delle responsabilità: retrieval, scoring, generazione e persistenza sono separati a livello di servizio.
•	Explainability prima della “magia”: ogni suggerimento è riconducibile a chunk specifici del CV o a note della sessione.

Deploy e configurazione
Architettura di deployment
Il sistema è deployato su due piattaforme separate:

•	Frontend Next.js: Vercel (recruiting-project-ten.vercel.app) deploy automatico ad ogni push su GitHub.
•	Backend Django: eseguito localmente ed esposto tramite ngrok, che crea un tunnel HTTPS pubblico verso localhost:8000.

Questa scelta è motivata dal fatto che i modelli AI (sentence-transformers + PyTorch) richiedono almeno 1-2 GB di RAM, rendendo i tier gratuiti dei cloud provider inadeguati per un deploy stabile.



Configurazione ngrok
Per esporre il backend Django al frontend Vercel, seguire questi passaggi:

1.	Scaricare ngrok da ngrok.com e autenticarsi con il proprio token.
2.	Avviare Django: python manage.py runserver
3.	Avviare ngrok: ngrok http 8000
4.	Copiare l'URL Forwarding (es. https://abc123.ngrok-free.app) e aggiornarlo in Vercel come variabile NEXT_PUBLIC_API_URL.
5.	Aggiornare ALLOWED_HOSTS e CORS_ALLOWED_ORIGINS nel file .env del backend con il nuovo dominio ngrok e il dominio Vercel.

Nota: l'URL ngrok cambia ad ogni riavvio sul piano gratuito. Per demo stabili è necessario ripetere i passaggi 3-5 o sottoscrivere il piano ngrok con dominio fisso.

Variabili d'ambiente
Il backend richiede un file .env nella root del progetto Django con le seguenti variabili:

SECRET_KEY, DEBUG, ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS
DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT
OPENAI_API_KEY, OPENAI_MODEL
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET
EMBEDDING_MODEL

Il frontend su Vercel richiede le variabili NEXT_PUBLIC_* per Firebase e NEXT_PUBLIC_API_URL per il backend.

Struttura del progetto

RecruitingProject/          ← root Django
  candidates/
    views.py               ← tutte le API views
    models.py              ← modelli managed=False
    urls.py                ← routing
    services/
      llm_service.py       ← generazione domande AI
  RecruitingProject/
    settings.py            ← configurazione
    urls.py

interview-copilot-ui/      ← root Next.js
  app/
    page.tsx               ← home con lista sessioni
    login/page.tsx         ← autenticazione Google
    sessions/
      new/page.tsx         ← wizard 4 step
      [id]/page.tsx        ← call page
      [id]/recap/page.tsx  ← recap finale
  components/
    CVViewer.tsx           ← visualizzatore CV
    RiskChart.tsx          ← grafico rischio
    JitsiMeet.tsx          ← videochiamata embedded
  lib/
    api.ts                 ← client HTTP tipizzato
    firebase.ts            ← autenticazione
    AuthContext.tsx        ← stato globale utente

Possibili evoluzioni
Funzionalità
•	Riconoscimento vocale real-time: trascrizione automatica della call con Web Speech API o Whisper, per alimentare le note senza che il recruiter debba scrivere manualmente durante la conversazione.
•	Sentiment analysis più granulare: invece di tre livelli di rischio, un modello fine-tuned su conversazioni di recruiting potrebbe fornire segnali più precisi su esitazioni, incongruenze o entusiasmo del candidato.
•	Dashboard analytics: aggregazione dei dati di più sessioni per visualizzare trend su candidati, posizioni, coverage score medi e tassi di conversione.
•	Modalità multi-sessione: possibilità di gestire più candidati in parallelo da una stessa dashboard, utile per recruiting day o hackathon di selezione.
•	Integrazione ATS: webhook o API per sincronizzare automaticamente i recap con sistemi come Greenhouse, Lever o Workday.
•	Export PDF del recap: generazione automatica di un documento di valutazione da allegare al profilo del candidato.
•	Profilazione pre-intervista tramite scraping: percorrere possibili repositories pubblici di Github ed il profilo del candidato per ottenere ulteriori informazioni su ulteriori skills.


Architettura e performance
•	WebSocket per il real-time: sostituire il polling a 2 secondi con una connessione WebSocket persistente per aggiornamenti istantanei tra recruiter multipli nella stessa sessione.
•	Deploy cloud del backend: migrazione a un cloud provider con almeno 2 GB di RAM (es. Render Standard, Railway Pro, o AWS ECS) per eliminare la dipendenza dal backend locale e da ngrok.
•	Cache degli embeddings: Redis per cachare gli embedding dei CV e JD più usati, riducendo la latenza delle query semantiche.
•	Autenticazione dominio: limitare l'accesso solo a email con dominio aziendale specifico, invece di qualsiasi account Google.
•	Pipeline di chunking migliorata: chunking semantico basato su sezioni del CV invece di finestre a dimensione fissa, per embedding più precisi.
Il codice sorgente è disponibile su GitHub: github.com/giuseppeamoruso/RecruitingProject
