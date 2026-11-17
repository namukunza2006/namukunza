import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  DailyTask,
  ExecutedTaskAction,
  GroundingSource,
  SentimentMetadata,
  ThinkingDepth,
  VisemeKeyframe,
} from '../types';

export interface TtsPayloadEvent {
  requestId: string;
  audioBase64: string;
  mimeType: string;
  durationMs: number;
  visemes: VisemeKeyframe[];
  sentiment?: SentimentMetadata;
}

interface UseGideonStreamOptions {
  onChatStart?: (requestId: string) => void;
  onChatToken?: (requestId: string, delta: string, accumulatedText: string) => void;
  onSentimentUpdate?: (requestId: string, sentiment: SentimentMetadata) => void;
  onTasksUpdated?: (tasks: DailyTask[], action?: ExecutedTaskAction) => void;
  onChatComplete?: (payload: {
    requestId: string;
    reply: string;
    sentiment: SentimentMetadata;
    sources?: GroundingSource[];
    actions?: ExecutedTaskAction[];
    tasks?: DailyTask[];
  }) => void;
  onChatError?: (requestId: string, error: string) => void;
  onTtsPayload?: (payload: TtsPayloadEvent) => void;
  onTtsError?: (requestId: string, text: string, error: string) => void;
}

export function useGideonStream(options: UseGideonStreamOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    if (disposedRef.current) return;
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/stream`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type?: string;
          requestId?: string;
          delta?: string;
          text?: string;
          sentiment?: SentimentMetadata;
          tasks?: DailyTask[];
          action?: ExecutedTaskAction;
          reply?: string;
          sources?: GroundingSource[];
          actions?: ExecutedTaskAction[];
          error?: string;
          audioBase64?: string;
          mimeType?: string;
          durationMs?: number;
          visemes?: VisemeKeyframe[];
        };

        const reqId = msg.requestId || '';
        switch (msg.type) {
          case 'stream:ready':
            setIsConnected(true);
            break;
          case 'chat:start':
            optionsRef.current.onChatStart?.(reqId);
            break;
          case 'chat:token':
            optionsRef.current.onChatToken?.(reqId, msg.delta ?? '', msg.text ?? '');
            break;
          case 'sentiment:update':
            if (msg.sentiment) {
              optionsRef.current.onSentimentUpdate?.(reqId, msg.sentiment);
            }
            break;
          case 'tasks:updated':
            if (Array.isArray(msg.tasks)) {
              optionsRef.current.onTasksUpdated?.(msg.tasks, msg.action);
            }
            break;
          case 'chat:complete':
            optionsRef.current.onChatComplete?.({
              requestId: reqId,
              reply: msg.reply ?? '',
              sentiment: msg.sentiment ?? {
                state: 'neutral',
                intensity: 0.5,
                complexity: 0.4,
                intent: 'explanation',
              },
              sources: msg.sources,
              actions: msg.actions,
              tasks: msg.tasks,
            });
            break;
          case 'chat:error':
            optionsRef.current.onChatError?.(reqId, msg.error || 'Erreur de streaming.');
            break;
          case 'tts:payload':
            if (msg.audioBase64) {
              optionsRef.current.onTtsPayload?.({
                requestId: reqId,
                audioBase64: msg.audioBase64,
                mimeType: msg.mimeType || 'audio/wav',
                durationMs: msg.durationMs || 0,
                visemes: msg.visemes ?? [],
                sentiment: msg.sentiment,
              });
            }
            break;
          case 'tts:error':
            optionsRef.current.onTtsError?.(
              reqId,
              msg.text ?? '',
              msg.error || 'Erreur synthèse vocale.'
            );
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('[useGideonStream parse error]', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      if (!disposedRef.current) {
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, 1600);
      }
    };

    ws.onerror = () => {
      setIsConnected(false);
    };
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    connect();
    const keepAlive = window.setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', requestId: `ping-${Date.now()}` }));
      }
    }, 25000);

    return () => {
      disposedRef.current = true;
      window.clearInterval(keepAlive);
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendChatStream = useCallback(
    (params: {
      requestId: string;
      message: string;
      history: Pick<ChatMessage, 'role' | 'text'>[];
      thinkingDepth: ThinkingDepth;
      attachment?: { mimeType: string; data: string; name: string };
      autoSpeak: boolean;
    }): boolean => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return false;
      }
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:send',
          ...params,
        })
      );
      return true;
    },
    []
  );

  const requestTtsStream = useCallback(
    (text: string, sentiment?: SentimentMetadata): boolean => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return false;
      }
      wsRef.current.send(
        JSON.stringify({
          type: 'tts:request',
          requestId: `tts-${Date.now()}`,
          text,
          sentiment,
        })
      );
      return true;
    },
    []
  );

  return {
    isStreamConnected: isConnected,
    sendChatStream,
    requestTtsStream,
  };
}
