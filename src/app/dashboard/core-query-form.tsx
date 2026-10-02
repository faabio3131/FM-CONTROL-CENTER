"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { rotuloAutoridadeFonte, rotuloMetrica } from "@/presentation/pt-br";
import { CommandOrbLogo } from "@/presentation/command-orb-logo";

type State = {
  status: "idle" | "loading" | "success" | "error";
  answer?: string;
  evidence?: Array<{ ref: string; sourceAuthority?: string }>;
};

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  readonly error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionLike;
}

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
};

function speechRecognitionConstructor(): SpeechRecognitionConstructorLike | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function cognitiveErrorMessage(code?: string): string {
  if (code === "core.cognitive_model_unavailable") {
    return "Provedor cognitivo indisponível. Verifique a configuração, a credencial ou a conectividade do modelo.";
  }
  if (code === "core.cognitive_model_contract_invalid") {
    return "O provedor respondeu, mas a resposta não passou pelo contrato cognitivo governado.";
  }
  return "Não foi possível consultar o Core.";
}

function voiceErrorMessage(code?: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Permissão do microfone não concedida.";
  }
  if (code === "no-speech") {
    return "Nenhuma fala foi detectada. Tente novamente.";
  }
  return "Não foi possível reconhecer a fala neste momento.";
}

export function CoreQueryForm() {
  const [state, setState] = useState<State>({ status: "idle" });
  const [question, setQuestion] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseRef = useRef("");

  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const Constructor = speechRecognitionConstructor();
    if (!Constructor) {
      setVoiceMessage("Reconhecimento de voz não disponível neste navegador.");
      return;
    }

    const recognition = new Constructor();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = true;
    voiceBaseRef.current = question.trim();

    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index]?.[0]?.transcript?.trim();
        if (transcript) parts.push(transcript);
      }

      const spokenText = parts.join(" ").trim();
      const combined = [voiceBaseRef.current, spokenText].filter(Boolean).join(" ").trim();
      setQuestion(combined);
      setVoiceMessage(spokenText ? "Transcrição recebida." : "Ouvindo…");
    };

    recognition.onerror = (event) => {
      setVoiceMessage(voiceErrorMessage(event.error));
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setVoiceMessage("Ouvindo…");
    setListening(true);

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setVoiceMessage("Não foi possível iniciar o microfone.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) return;

    const activeRecognition = recognitionRef.current;
    if (activeRecognition) {
      activeRecognition.onresult = null;
      activeRecognition.onerror = null;
      activeRecognition.onend = null;
      activeRecognition.abort();
      recognitionRef.current = null;
      setListening(false);
    }

    setQuestion("");
    setVoiceMessage("");
    setState({ status: "loading" });

    try {
      const response = await fetch("/api/core/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: normalizedQuestion }),
      });

      const payload = await response.json() as {
        answer?: string;
        evidence?: Array<{ ref: string; sourceAuthority?: string }>;
        error?: string;
      };

      if (!response.ok) {
        setState({ status: "error", answer: cognitiveErrorMessage(payload.error) });
        return;
      }

      if (typeof payload.answer !== "string" || !payload.answer.trim()) {
        setState({ status: "error", answer: cognitiveErrorMessage() });
        return;
      }

      setState({ status: "success", answer: payload.answer, evidence: payload.evidence });
    } catch {
      setState({ status: "error", answer: cognitiveErrorMessage() });
    }
  }

  return (
    <section className="core-panel" aria-labelledby="core-title">
      <div className="core-panel-head">
        <div className="core-panel-copy">
          <span className="eyebrow">Inteligência artificial da FM</span>
          <h2 id="core-title">FM COMMAND CORE</h2>
          <p>Seu copiloto executivo para dados, operações e crescimento. Pergunte, analise cenários e tome decisões mais rápidas com base nos dados governados da empresa.</p>
        </div>
        <div className="core-orb-stage" aria-label="Núcleo de inteligência conectada">
          <span className="core-orb-note left top">Dados em tempo real</span>
          <span className="core-orb-note left middle">Análise estratégica</span>
          <span className="core-orb-note left bottom">Execução orientada</span>
          <div className="core-orb-visual">
            <CommandOrbLogo className="core-orb-logo" />
          </div>
          <span className="core-orb-note right top">Análises com IA</span>
          <span className="core-orb-note right middle">Cenários de crescimento</span>
          <span className="core-orb-note right bottom">Mais controle e eficiência</span>
        </div>
      </div>

      <form onSubmit={submit} className="core-form command-core-form">
        <label className="sr-only" htmlFor="core-question">Pergunta executiva</label>
        <div className="core-input-row command-core-input-row">
          <span className="command-core-spark" aria-hidden="true">✦</span>
          <input
            id="core-question"
            name="question"
            maxLength={4000}
            placeholder="Pergunte ao Core sobre faturamento, testes gratuitos, cancelamentos ou operação..."
            autoComplete="off"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button
            className="button core-voice-button command-core-voice"
            type="button"
            onClick={toggleVoice}
            aria-pressed={listening}
            aria-label={listening ? "Parar reconhecimento de voz" : "Falar a pergunta"}
            title={listening ? "Parar reconhecimento de voz" : "Falar a pergunta"}
          >
            <span aria-hidden="true">◉</span>
          </button>
          <button className="button core-submit-button command-core-submit" type="submit" disabled={state.status === "loading" || !question.trim()}>
            <span aria-hidden="true">→</span>
            <span className="sr-only">{state.status === "loading" ? "Consultando" : "Consultar"}</span>
          </button>
        </div>
        <div className="core-suggestions command-core-suggestions" aria-label="Perguntas sugeridas">
          {[
            "Qual a receita recorrente mensal deste mês?",
            "Por que o cancelamento aumentou?",
            "Comparar desempenho dos produtos",
            "Previsão de receita para o próximo trimestre",
          ].map((suggestion) => (
            <button
              className="core-suggestion"
              type="button"
              key={suggestion}
              onClick={() => setQuestion(suggestion)}
              disabled={state.status === "loading"}
            >
              {suggestion}
            </button>
          ))}
        </div>
        {voiceMessage ? <small className="core-voice-status" aria-live="polite">{voiceMessage}</small> : null}
      </form>

      {state.answer && (
        <div className={state.status === "error" ? "core-answer error" : "core-answer"} role="status" aria-live="polite">
          <strong>{state.status === "error" ? "Indisponível" : "Resposta"}</strong>
          <p>{state.answer}</p>
          {state.evidence?.length ? (
            <small className="core-evidence">
              Proveniência: {state.evidence
                .map((item) => `${rotuloMetrica(item.ref)} · ${rotuloAutoridadeFonte(item.sourceAuthority)}`)
                .join(", ")}
            </small>
          ) : null}
        </div>
      )}
    </section>
  );
}
