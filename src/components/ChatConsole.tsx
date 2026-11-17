import React, { useRef, useState } from 'react';
import {
  Atom,
  Check,
  Copy,
  ExternalLink,
  Paperclip,
  Send,
  Volume2,
  X,
} from 'lucide-react';
import type { ChatMessage, ThinkingDepth } from '../types';

interface ChatConsoleProps {
  messages: ChatMessage[];
  isLoading: boolean;
  thinkingDepth: ThinkingDepth;
  autoSpeak: boolean;
  draftText: string;
  modeTitle: string;
  modeSubtitle: string;
  showSciencePresets?: boolean;
  onDraftChange: (text: string) => void;
  onThinkingDepthChange: (depth: ThinkingDepth) => void;
  onToggleAutoSpeak: () => void;
  onSendMessage: (
    text: string,
    attachment?: { mimeType: string; data: string; name: string }
  ) => void;
  onSpeakMessage: (text: string) => void;
}

const SCIENCE_PRESETS = [
  {
    label: 'Complexité & Consensus distribué',
    prompt:
      "Explique formellement les compromis entre le théorème CAP, Raft et Paxos pour un système distribué tolérant aux pannes byzantines, avec un exemple de machine à états en TypeScript.",
  },
  {
    label: 'Mécanique quantique & Intrication',
    prompt:
      "Démontre mathématiquement comment l'inégalité de Bell (CHSH) invalide les théories à variables cachées locales et comment cela s'applique à la cryptographie quantique QKD.",
  },
  {
    label: 'Optimisation GPU & Transformers',
    prompt:
      "Analyse la complexité mémoire et arithmétique de FlashAttention par rapport à l'attention quadratique standard, avec formules de tiling SRAM/HBM.",
  },
  {
    label: 'Thermodynamique hors équilibre',
    prompt:
      "Synthétise les principes de production d'entropie minimale de Prigogine dans les systèmes dissipatifs et leur analogie en théorie de l'information.",
  },
];

const DEPTH_OPTIONS: { value: ThinkingDepth; label: string }[] = [
  { value: 'LOW', label: 'Rapide' },
  { value: 'MEDIUM', label: 'Équilibré' },
  { value: 'HIGH', label: 'Approfondi' },
  { value: 'XHIGH', label: 'Extrême' },
];

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard restriction
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-sky-900/50 bg-[#050810]">
      <div className="flex items-center justify-between border-b border-sky-900/40 px-3 py-1.5 text-xs text-slate-400">
        <span className="font-mono">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex min-h-[28px] items-center gap-1.5 px-2 text-xs text-sky-300 hover:text-sky-200"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copié
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copier
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-sky-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-sky-950/70 px-1.5 py-0.5 font-mono text-xs text-sky-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function FormattedProse({ content }: { content: string }) {
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-slate-200 sm:text-[15px]">
      {segments.map((seg, index) => {
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const inner = seg.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const lang = firstNewline > -1 ? inner.slice(0, firstNewline).trim() : '';
          const code = firstNewline > -1 ? inner.slice(firstNewline + 1) : inner;
          return <CodeBlock key={index} code={code.trimEnd()} lang={lang} />;
        }

        const lines = seg.split('\n').filter((l) => l.trim().length > 0);
        return (
          <div key={index} className="space-y-1.5">
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim();
              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lineIdx} className="pt-1 font-display text-sm font-semibold text-sky-200">
                    {renderInlineFormatting(trimmed.slice(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={lineIdx} className="pt-1.5 font-display text-base font-semibold text-white">
                    {renderInlineFormatting(trimmed.slice(3))}
                  </h3>
                );
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <p key={lineIdx} className="pl-3 text-slate-200">
                    <span className="mr-2 text-sky-400">·</span>
                    {renderInlineFormatting(trimmed.slice(2))}
                  </p>
                );
              }
              return <p key={lineIdx}>{renderInlineFormatting(trimmed)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  messages,
  isLoading,
  thinkingDepth,
  autoSpeak,
  draftText,
  modeTitle,
  modeSubtitle,
  showSciencePresets = false,
  onDraftChange,
  onThinkingDepthChange,
  onToggleAutoSpeak,
  onSendMessage,
  onSpeakMessage,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const [attachment, setAttachment] = useState<{
    mimeType: string;
    data: string;
    name: string;
  } | null>(null);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      if (base64) {
        setAttachment({
          mimeType: file.type || 'text/plain',
          data: base64,
          name: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!draftText.trim() && !attachment) || isLoading) return;
    onSendMessage(draftText.trim() || `Analyse ce fichier : ${attachment?.name}`, attachment ?? undefined);
    setAttachment(null);
    setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  };

  return (
    <section className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-2xl border border-sky-900/40 bg-[#080E1A]">
      {/* Console Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-900/40 bg-[#0B1120] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-white sm:text-lg">
            {modeTitle}
          </h2>
          <p className="truncate text-xs text-slate-400">{modeSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Profondeur de raisonnement"
            className="flex items-center rounded-lg border border-sky-900/40 bg-[#050810] p-0.5"
          >
            {DEPTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onThinkingDepthChange(opt.value)}
                className={`min-h-[32px] rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  thinkingDepth === opt.value
                    ? 'bg-sky-500/20 text-sky-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleAutoSpeak}
            aria-pressed={autoSpeak}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap ${
              autoSpeak
                ? 'border-sky-400/50 bg-sky-500/15 text-sky-200'
                : 'border-sky-900/40 bg-[#050810] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            Voix auto
          </button>
        </div>
      </div>

      {/* Science & CS Quick Presets */}
      {showSciencePresets && (
        <div className="border-b border-sky-900/30 bg-[#070C17] px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-sky-300">
            <Atom className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Requêtes scientifiques & informatiques avancées</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {SCIENCE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => onSendMessage(preset.prompt)}
                disabled={isLoading}
                className="flex min-h-[44px] items-center justify-between rounded-xl border border-sky-900/40 bg-[#0B1120] px-3 py-2 text-left text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/50 hover:text-white disabled:opacity-50"
              >
                <span className="truncate">{preset.label}</span>
                <span className="ml-2 shrink-0 text-sky-400">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.map((msg) => (
          <article
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
              <span className="font-medium text-slate-300">
                {msg.role === 'user' ? 'Vous' : 'namukunzAI'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{msg.timestamp}</span>
              {msg.mode === 'voice' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-300">Vocal</span>
                </>
              )}
              {msg.attachmentName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-300">{msg.attachmentName}</span>
                </>
              )}
              {msg.role === 'assistant' && msg.sentiment && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[11px] tabular-nums text-sky-400/80">
                    {msg.sentiment.state}
                  </span>
                </>
              )}
            </div>

            <div
              className={`max-w-[92%] rounded-2xl px-4 py-3 sm:max-w-[85%] ${
                msg.role === 'user'
                  ? 'border border-sky-500/30 bg-sky-500/10 text-slate-100'
                  : 'border border-sky-900/40 bg-[#0B1120] text-slate-100'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="text-sm leading-relaxed text-slate-100">{msg.text}</p>
              ) : msg.isStreaming && !msg.text ? (
                <p className="text-sm text-sky-300/80">Synchronisation du flux neuronal...</p>
              ) : (
                <FormattedProse content={msg.text} />
              )}

              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-sky-900/40 pt-2.5 text-xs text-sky-300">
                  {msg.actions.map((act, idx) => (
                    <p key={idx}>● Action exécutée : {act.summary}</p>
                  ))}
                </div>
              )}

              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-sky-900/40 pt-2.5">
                  <p className="text-xs font-medium text-slate-400">Sources vérifiées</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {msg.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200 hover:underline"
                      >
                        <span className="max-w-[220px] truncate">{src.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {msg.role === 'assistant' && !msg.isStreaming && msg.text && (
                <div className="mt-2.5 flex justify-end border-t border-sky-900/30 pt-2">
                  <button
                    type="button"
                    onClick={() => onSpeakMessage(msg.text)}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/10 hover:text-sky-200"
                  >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Écouter Gideon
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}

        {isLoading && !messages.some((m) => m.isStreaming) && (
          <div className="flex items-center gap-2.5 text-xs font-medium text-sky-300">
            <span aria-hidden="true">●</span>
            <span>namukunzAI analyse votre requête...</span>
          </div>
        )}
        <div ref={scrollEndRef} />
      </div>

      {/* Input Composer */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-sky-900/40 bg-[#0B1120] p-3 sm:p-4"
      >
        {attachment && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-sky-800/60 bg-[#050810] px-3 py-1.5 text-xs text-sky-200">
            <span className="truncate">Fichier prêt : {attachment.name}</span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label="Retirer le fichier"
              className="ml-2 p-1 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.txt,.csv,.json,.md,.py,.ts,.tsx,.js,.log,.pdf"
            onChange={handleFilePick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Joindre un fichier ou une image"
            className="flex min-h-[46px] min-w-[46px] shrink-0 items-center justify-center rounded-xl border border-sky-900/50 bg-[#050810] text-slate-300 transition-colors hover:border-sky-500/50 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            value={draftText}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            rows={1}
            placeholder="Posez une question scientifique, informatique, ou donnez une instruction de tâche..."
            className="min-h-[46px] max-h-[120px] flex-1 resize-none rounded-xl border border-sky-900/50 bg-[#050810] px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />

          <button
            type="submit"
            disabled={isLoading || (!draftText.trim() && !attachment)}
            aria-label="Envoyer"
            className="flex min-h-[46px] min-w-[46px] shrink-0 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );
};
