"use client";

import { useEffect, useRef, useState } from "react";

interface SpeechTranscriberProps {
  onTranscript: (text: string) => void; // chiamata quando c'è testo da inviare come nota
  disabled?: boolean;
}

// Extend window per Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function SpeechTranscriber({ onTranscript, disabled }: SpeechTranscriberProps) {
  const [isListening, setIsListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [buffer, setBuffer] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const bufferRef = useRef("");

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;       // non si ferma dopo una frase
    recognition.interimResults = true;   // mostra testo mentre parla
    recognition.lang = "it-IT";          // italiano

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + " ";
        } else {
          interim += transcript;
        }
      }

      // Aggiorna testo live (quello che vede il recruiter in tempo reale)
      setLiveText(interim);

      if (final) {
        // Accumula nel buffer
        bufferRef.current += final;
        setBuffer(bufferRef.current);

        // Reset timer silenzio — se il candidato smette di parlare per 4 secondi
        // inviamo automaticamente il buffer come nota
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (bufferRef.current.trim().length > 20) {
            onTranscript(bufferRef.current.trim());
            bufferRef.current = "";
            setBuffer("");
            setLiveText("");
          }
        }, 4000); // 4 secondi di silenzio = momento saliente rilevato
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") {
        console.error("Speech error:", event.error);
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Riavvia automaticamente se ancora in ascolto
      if (isListening) {
        recognition.start();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setLiveText("");
      // Invia quello che c'è nel buffer prima di fermarsi
      if (bufferRef.current.trim().length > 0) {
        onTranscript(bufferRef.current.trim());
        bufferRef.current = "";
        setBuffer("");
      }
    } else {
      bufferRef.current = "";
      setBuffer("");
      setLiveText("");
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const sendNow = () => {
    if (bufferRef.current.trim().length > 0) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      onTranscript(bufferRef.current.trim());
      bufferRef.current = "";
      setBuffer("");
      setLiveText("");
    }
  };

  if (!supported) {
    return (
      <div className="text-xs text-gray-600 px-2 py-1">
        ⚠ Trascrizione non supportata — usa Chrome o Edge
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Testo live — quello che sta dicendo il candidato adesso */}
      {isListening && (liveText || buffer) && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 space-y-1">
          {buffer && (
            <p className="text-xs text-gray-400 leading-relaxed">{buffer}</p>
          )}
          {liveText && (
            <p className="text-xs text-gray-600 italic">{liveText}...</p>
          )}
        </div>
      )}

      {/* Controlli */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleListening}
          disabled={disabled}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-40
            ${isListening
              ? "bg-red-900/40 border border-red-800 text-red-300 hover:bg-red-800/60"
              : "bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700"}`}
        >
          {isListening ? (
            <>
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              Stop trascrizione
            </>
          ) : (
            <>
              <span>🎤</span>
              Avvia trascrizione
            </>
          )}
        </button>

        {isListening && buffer && (
          <button
            onClick={sendNow}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-indigo-900/40 border border-indigo-800 text-indigo-300 hover:bg-indigo-800/60 transition-colors"
          >
            Analizza ora →
          </button>
        )}

        {isListening && (
          <span className="text-xs text-gray-600">
            Invio automatico dopo 4s di silenzio
          </span>
        )}
      </div>
    </div>
  );
}