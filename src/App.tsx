import { useCallback, useEffect, useRef, useState } from 'react';
import { Atom, BarChart3, CheckSquare, Radio } from 'lucide-react';
import { ChatConsole } from './components/ChatConsole';
import { DataLabPanel } from './components/DataLabPanel';
import { GideonHologram } from './components/GideonHologram';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { TasksPanel } from './components/TasksPanel';
import { useGideonStream } from './hooks/useGideonStream';
import { useGideonVoice } from './hooks/useGideonVoice';
import type {
  ActiveTab,
  ChatMessage,
  DailyTask,
  ExecutedTaskAction,
  SentimentMetadata,
  TaskCategory,
  TaskPriority,
  ThinkingDepth,
} from './types';

const TASKS_CACHE_KEY = 'namukunz_tasks_cache_v1';

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-welcome',
    role: 'assistant',
    text: "Salut, je suis prête. Qu'est-ce qu'on explore aujourd'hui ? Tu peux me parler directement en **Voix Live**, me dicter une idée, déposer des données brutes à décortiquer, ou me poser une colle d'architecture système ou de sciences.",
    timestamp: nowTimeLabel(),
  },
];

const INITIAL_SENTIMENT: SentimentMetadata = {
  state: 'warm',
  intensity: 0.65,
  complexity: 0.3,
  intent: 'dialogue',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('gideon');
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [tasks, setTasks] = useState<DailyTask[]>(() => {
    try {
      const cached = localStorage.getItem(TASKS_CACHE_KEY);
      return cached ? (JSON.parse(cached) as DailyTask[]) : [];
    } catch {
      return [];
    }
  });
  const [draftText, setDraftText] = useState('');
  const [thinkingDepth, setThinkingDepth] = useState<ThinkingDepth>('HIGH');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [activeSentiment, setActiveSentiment] = useState<SentimentMetadata>(INITIAL_SENTIMENT);

  const lastStreamedReplyRef = useRef('');

  const persistTasksCache = useCallback((nextTasks: DailyTask[]) => {
    setTasks(nextTasks);
    try {
      localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(nextTasks));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  useEffect(() => {
    fetch('/api/tasks')
      .then((res) => res.json())
      .then((data: { tasks?: DailyTask[] }) => {
        if (Array.isArray(data.tasks)) {
          persistTasksCache(data.tasks);
        }
      })
      .catch(() => {
        // Offline fallback uses cached tasks already loaded in state
      });
  }, [persistTasksCache]);

  const handleLiveTranscript = useCallback((role: 'user' | 'assistant', text: string) => {
    if (role === 'assistant') {
      const lower = text.toLowerCase();
      if (/erreur|segfault|critique|attention/.test(lower)) {
        setActiveSentiment({ state: 'alert', intensity: 0.78, complexity: 0.7, intent: 'diagnostic' });
      } else if (text.includes('?')) {
        setActiveSentiment({ state: 'curious', intensity: 0.76, complexity: 0.6, intent: 'exploration' });
      } else {
        setActiveSentiment({ state: 'warm', intensity: 0.72, complexity: 0.5, intent: 'dialogue' });
      }
    }
    setMessages((prev) => [
      ...prev,
      {
        id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role,
        text,
        timestamp: nowTimeLabel(),
        mode: 'voice',
      },
    ]);
  }, []);

  const handleVoiceTasksSync = useCallback(
    (updatedTasks: DailyTask[], _action?: ExecutedTaskAction) => {
      persistTasksCache(updatedTasks);
    },
    [persistTasksCache]
  );

  const sendMessageFromDictationRef = useRef<(transcript: string) => void>(() => {});

  const voice = useGideonVoice({
    onLiveTranscript: handleLiveTranscript,
    onTasksUpdated: handleVoiceTasksSync,
    onDictationResult: (transcript) => {
      sendMessageFromDictationRef.current(transcript);
    },
  });

  const stream = useGideonStream({
    onChatStart: (requestId) => {
      const msgId = `ai-${requestId}`;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msgId)) return prev;
        return [
          ...prev,
          {
            id: msgId,
            role: 'assistant',
            text: '',
            timestamp: nowTimeLabel(),
            isStreaming: true,
          },
        ];
      });
    },
    onChatToken: (requestId, _delta, accumulatedText) => {
      const msgId = `ai-${requestId}`;
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, text: accumulatedText, isStreaming: true } : m))
      );
    },
    onSentimentUpdate: (requestId, sentiment) => {
      setActiveSentiment(sentiment);
      const msgId = `ai-${requestId}`;
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, sentiment } : m)));
    },
    onTasksUpdated: (updatedTasks) => {
      persistTasksCache(updatedTasks);
    },
    onChatComplete: ({ requestId, reply, sentiment, sources, actions, tasks: updatedTasks }) => {
      if (Array.isArray(updatedTasks)) {
        persistTasksCache(updatedTasks);
      }
      setActiveSentiment(sentiment);
      lastStreamedReplyRef.current = reply;
      const msgId = `ai-${requestId}`;
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === msgId);
        if (!exists) {
          return [
            ...prev,
            {
              id: msgId,
              role: 'assistant',
              text: reply,
              timestamp: nowTimeLabel(),
              sentiment,
              sources,
              actions,
              isStreaming: false,
            },
          ];
        }
        return prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                text: reply,
                sentiment,
                sources,
                actions,
                isStreaming: false,
              }
            : m
        );
      });
      setIsChatLoading(false);
    },
    onChatError: (requestId, error) => {
      const msgId = `ai-${requestId}`;
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === msgId);
        if (!exists) {
          return [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              text: `✖ ${error}`,
              timestamp: nowTimeLabel(),
            },
          ];
        }
        return prev.map((m) =>
          m.id === msgId ? { ...m, text: `✖ ${error}`, isStreaming: false } : m
        );
      });
      setIsChatLoading(false);
    },
    onTtsPayload: (payload) => {
      if (payload.sentiment) {
        setActiveSentiment(payload.sentiment);
      }
      void voice.playSynthesizedPayload({
        audioBase64: payload.audioBase64,
        visemes: payload.visemes,
        fallbackText: lastStreamedReplyRef.current,
      });
    },
    onTtsError: (_requestId, text, error) => {
      voice.handleTtsStreamError(text, error);
    },
  });

  const speakViaStreamOrHttp = useCallback(
    (text: string) => {
      lastStreamedReplyRef.current = text;
      void voice.speakText(text, (clean) => stream.requestTtsStream(clean, activeSentiment));
    },
    [activeSentiment, stream, voice]
  );

  const sendMessage = useCallback(
    async (
      text: string,
      attachment?: { mimeType: string; data: string; name: string },
      forceSpeak = false
    ) => {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text,
        timestamp: nowTimeLabel(),
        attachmentName: attachment?.name,
      };
      setMessages((prev) => [...prev, userMsg]);
      setDraftText('');
      setIsChatLoading(true);
      setActiveSentiment({
        state: 'focused',
        intensity: 0.7,
        complexity: 0.6,
        intent: 'processing',
      });

      const historyPayload = messages
        .filter((m) => !m.isStreaming && m.text.trim().length > 0)
        .slice(-8)
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      const shouldAutoSpeak = autoSpeak || forceSpeak;
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Primary path: continuous bidirectional WebSocket stream
      const sentOverWs = stream.sendChatStream({
        requestId,
        message: text,
        history: historyPayload,
        thinkingDepth,
        attachment,
        autoSpeak: shouldAutoSpeak,
      });

      if (sentOverWs) {
        return;
      }

      // Fallback path when WebSocket is offline/reconnecting
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: historyPayload,
            thinkingDepth,
            attachment,
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          sentiment?: SentimentMetadata;
          sources?: ChatMessage['sources'];
          actions?: ChatMessage['actions'];
          tasks?: DailyTask[];
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || 'Erreur de communication avec namukunzAI.');
        }

        if (Array.isArray(data.tasks)) {
          persistTasksCache(data.tasks);
        }

        if (data.sentiment) {
          setActiveSentiment(data.sentiment);
        }

        const replyText = data.reply || 'Réponse reçue.';
        const assistantMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: replyText,
          timestamp: nowTimeLabel(),
          sentiment: data.sentiment,
          sources: data.sources,
          actions: data.actions,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (shouldAutoSpeak) {
          speakViaStreamOrHttp(replyText);
        }
      } catch (err) {
        const errorText =
          err instanceof Error ? err.message : 'Impossible de joindre le serveur namukunzAI.';
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            text: `✖ ${errorText}`,
            timestamp: nowTimeLabel(),
          },
        ]);
      } finally {
        setIsChatLoading(false);
      }
    },
    [autoSpeak, messages, persistTasksCache, speakViaStreamOrHttp, stream, thinkingDepth]
  );

  sendMessageFromDictationRef.current = (transcript: string) => {
    void sendMessage(transcript, undefined, autoSpeak);
  };

  const handleSendChat = (
    text: string,
    attachment?: { mimeType: string; data: string; name: string }
  ) => {
    void sendMessage(text, attachment, false);
  };

  const handleCreateTask = async (input: {
    title: string;
    category: TaskCategory;
    priority: TaskPriority;
    dueTime?: string;
  }) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as { tasks?: DailyTask[] };
    if (Array.isArray(data.tasks)) {
      persistTasksCache(data.tasks);
    }
  };

  const handleToggleTask = async (id: string, completed: boolean) => {
    const optimistic = tasks.map((t) => (t.id === id ? { ...t, completed } : t));
    persistTasksCache(optimistic);
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    const data = (await res.json()) as { tasks?: DailyTask[] };
    if (Array.isArray(data.tasks)) {
      persistTasksCache(data.tasks);
    }
  };

  const handleDeleteTask = async (id: string) => {
    const optimistic = tasks.filter((t) => t.id !== id);
    persistTasksCache(optimistic);
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = (await res.json()) as { tasks?: DailyTask[] };
    if (Array.isArray(data.tasks)) {
      persistTasksCache(data.tasks);
    }
  };

  const navItems: { id: ActiveTab; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    {
      id: 'gideon',
      label: 'Interface Gideon',
      shortLabel: 'Gideon',
      icon: <Radio className="h-5 w-5" />,
    },
    {
      id: 'sciences',
      label: 'Sciences & Code',
      shortLabel: 'Sciences',
      icon: <Atom className="h-5 w-5" />,
    },
    {
      id: 'donnees',
      label: 'Synthèse Données',
      shortLabel: 'Données',
      icon: <BarChart3 className="h-5 w-5" />,
    },
    {
      id: 'taches',
      label: 'Tâches',
      shortLabel: 'Tâches',
      icon: <CheckSquare className="h-5 w-5" />,
    },
  ];

  const effectiveGideonState = isChatLoading ? 'thinking' : voice.gideonState;
  const pendingTasks = tasks.filter((t) => !t.completed).slice(0, 4);

  return (
    <div className="min-h-dvh bg-[#050810] text-[#E6F1FF]">
      {/* Top Bar Contract (3 zones on desktop, compact 52px on mobile) */}
      <header className="sticky top-0 z-30 border-b border-sky-900/40 bg-[#050810]/90 backdrop-blur-md">
        <div className="mx-auto flex h-[52px] max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6 lg:h-14">
          {/* Zone 1: Single-element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('gideon');
            }}
            className="font-display text-lg font-semibold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            namukunzAI
          </a>

          {/* Zone 2: 4 single-line navigation links */}
          <nav
            aria-label="Navigation principale"
            className="hidden items-center gap-6 lg:flex"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[40px] border-b-2 px-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === item.id
                    ? 'border-sky-400 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <PWAInstallButton
              onFallbackAction={() => {
                void voice.startLiveSession();
              }}
              fallbackLabel={voice.isLiveActive ? 'Arrêter Live' : 'Voix Live'}
            />
          </div>
        </div>
      </header>

      {/* Main Responsive Command Bridge */}
      <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:pb-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Left Holographic Core Column (Imposing stage on Gideon tab; compact rail on other tabs) */}
          <aside
            className={`w-full shrink-0 space-y-4 lg:sticky lg:top-20 ${
              activeTab === 'gideon'
                ? 'block lg:w-[46%] xl:w-[48%]'
                : 'hidden lg:block lg:w-[360px] xl:w-[390px]'
            }`}
          >
            <GideonHologram
              state={effectiveGideonState}
              sentiment={activeSentiment}
              audioLevel={voice.audioLevel}
              speechFormants={voice.speechFormants}
              outputAnalyserRef={voice.outputAnalyserRef}
              visemePlaybackRef={voice.visemePlaybackRef}
              isLiveActive={voice.isLiveActive}
              isDictating={voice.isDictating}
              isSpeaking={voice.isSpeaking}
              isStreamConnected={stream.isStreamConnected}
              liveCaption={voice.liveCaption}
              voiceError={voice.voiceError}
              onToggleLive={() => {
                void voice.startLiveSession();
              }}
              onToggleDictation={() => {
                if (voice.isDictating) voice.stopDictation();
                else void voice.startDictation();
              }}
              onStopSpeaking={voice.stopSpeaking}
              onDismissError={voice.clearVoiceError}
              prominent={activeTab === 'gideon'}
            />

            {/* Quick Daily Tasks Overview in Sidebar */}
            <div className="hidden rounded-2xl border border-sky-900/40 bg-[#080E1A] p-4 lg:block">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-white">
                  Tâches prioritaires
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('taches')}
                  className="text-xs font-medium text-sky-300 hover:text-sky-200"
                >
                  Tout voir
                </button>
              </div>
              {pendingTasks.length === 0 ? (
                <p className="mt-3 text-xs text-slate-400">
                  Aucune tâche en attente.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-sky-900/30">
                  {pendingTasks.map((task) => (
                    <li key={task.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <button
                        type="button"
                        onClick={() => {
                          void handleToggleTask(task.id, !task.completed);
                        }}
                        aria-label={`Terminer ${task.title}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-800/70 bg-[#050810] text-transparent hover:border-sky-400"
                      >
                        ✓
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-100">
                          {task.title}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {task.category} · <span className="font-mono tabular-nums">{task.dueTime}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          {/* Right Workspace Stage */}
          <div className="min-w-0 flex-1">
            {(activeTab === 'gideon' || activeTab === 'sciences') && (
              <ChatConsole
                messages={messages}
                isLoading={isChatLoading}
                thinkingDepth={thinkingDepth}
                autoSpeak={autoSpeak}
                draftText={draftText}
                modeTitle={
                  activeTab === 'sciences'
                    ? 'Laboratoire Sciences & Informatique'
                    : 'Console Neuronale namukunzAI'
                }
                modeSubtitle={
                  activeTab === 'sciences'
                    ? 'Raisonnement avancé, mathématiques, physique, algorithmes et code'
                    : 'Dialogue multimodal, recherche en direct et pilotage des tâches'
                }
                showSciencePresets={activeTab === 'sciences'}
                onDraftChange={setDraftText}
                onThinkingDepthChange={setThinkingDepth}
                onToggleAutoSpeak={() => setAutoSpeak((prev) => !prev)}
                onSendMessage={handleSendChat}
                onSpeakMessage={speakViaStreamOrHttp}
              />
            )}

            {activeTab === 'donnees' && (
              <DataLabPanel
                onSpeakSummary={speakViaStreamOrHttp}
                onAddRecommendationTask={handleCreateTask}
              />
            )}

            {activeTab === 'taches' && (
              <TasksPanel
                tasks={tasks}
                onCreateTask={handleCreateTask}
                onToggleTask={handleToggleTask}
                onDeleteTask={handleDeleteTask}
              />
            )}
          </div>
        </div>
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation Bar (Android / iOS) */}
      <nav
        aria-label="Navigation mobile"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-sky-900/40 bg-[#050810]/95 backdrop-blur-md pb-safe lg:hidden"
      >
        <div className="grid h-14 grid-cols-4 items-center">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? 'text-sky-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium tracking-tight whitespace-nowrap">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
