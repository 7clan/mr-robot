"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useVoice — Web Speech API wrapper for text-to-speech and speech-to-text.
 * Both are built into modern browsers — NO external API required.
 */

// Minimal type defs for the Web Speech API (TS doesn't ship them by default)
interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<{ 0: SpeechRecognitionResultLike }>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function useVoice() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [supported, setSupported] = useState({
    synth: false,
    recognition: false,
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const synth = typeof window.speechSynthesis !== "undefined";
    const SR =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
        .webkitSpeechRecognition;

    // Use queueMicrotask to avoid synchronous setState in effect
    queueMicrotask(() => setSupported({ synth, recognition: !!SR }));

    if (synth) {
      const load = () => {
        const v = window.speechSynthesis.getVoices();
        if (v.length > 0) setVoices(v);
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!supported.synth || !voiceEnabled) return;
      window.speechSynthesis.cancel();
      const cleaned = text.replace(/\n+/g, ". ").replace(/\s+/g, " ").trim();
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      const enVoice =
        voices.find((v) => v.lang.startsWith("en")) || voices[0];
      if (enVoice) utterance.voice = enVoice;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [supported.synth, voiceEnabled, voices]
  );

  const stopSpeaking = useCallback(() => {
    if (supported.synth) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [supported.synth]);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((v) => {
      const next = !v;
      if (!next && supported.synth) {
        window.speechSynthesis.cancel();
        setSpeaking(false);
      }
      return next;
    });
  }, [supported.synth]);

  const startListening = useCallback(
    (onFinal: (text: string) => void) => {
      if (!supported.recognition) return;
      const SR =
        (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor })
          .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
          .webkitSpeechRecognition;
      if (!SR) return;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      const rec = new SR();
      rec.lang = "en-US";
      rec.continuous = false;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let interim = "";
        let final = "";
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          const txt = r[0].transcript;
          // results array has isFinal at length-1 in standard impl, but we read all
          if (i === e.results.length - 1) {
            final = txt;
          } else {
            interim += txt;
          }
        }
        setInterimText(interim || final);
      };
      rec.onend = () => {
        setListening(false);
        setInterimText((t) => {
          if (t) onFinal(t);
          return "";
        });
      };
      rec.onerror = () => {
        setListening(false);
        setInterimText("");
      };
      recognitionRef.current = rec;
      setListening(true);
      setInterimText("");
      try {
        rec.start();
      } catch {
        setListening(false);
      }
    },
    [supported.recognition]
  );

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setListening(false);
  }, []);

  return {
    voices,
    speaking,
    voiceEnabled,
    listening,
    interimText,
    supported,
    speak,
    stopSpeaking,
    toggleVoice,
    startListening,
    stopListening,
  };
}
