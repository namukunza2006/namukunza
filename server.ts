import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  FunctionResponseScheduling,
  InteractionStatus,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
} from '@google/genai';
import {
  analyzeComplexDataset,
  buildTaskToolDeclarations,
  executeTaskToolCall,
  formatGeminiError,
  getGeminiClient,
  NAMUKUNZ_SYSTEM_INSTRUCTION,
  runScientificAssistantChat,
  streamScientificAssistantChat,
  synthesizeGideonSpeechWithVisemes,
  transcribeUserAudio,
} from './server/gemini.ts';
import {
  analyzeProgressiveSentiment,
  type SentimentMetadata,
} from './server/sentimentTracker.ts';
import type { ChatTurn } from './server/types.ts';
import {
  createTask,
  deleteTask,
  listTasks,
  toggleTask,
  updateTask,
} from './server/tasksStore.ts';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'namukunzAI' });
  });

  app.get('/api/tasks', (_req, res) => {
    res.json({ tasks: listTasks() });
  });

  app.post('/api/tasks', (req, res) => {
    try {
      const { title, category, priority, dueTime, notes } = req.body ?? {};
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Le titre de la tâche est requis.' });
      }
      const task = createTask({ title, category, priority, dueTime, notes });
      return res.status(201).json({ task, tasks: listTasks() });
    } catch (err) {
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.patch('/api/tasks/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { completed, title, category, priority, dueTime, notes } = req.body ?? {};
      const updated =
        typeof completed === 'boolean' && Object.keys(req.body ?? {}).length === 1
          ? toggleTask(id, completed)
          : updateTask(id, { completed, title, category, priority, dueTime, notes });
      if (!updated) {
        return res.status(404).json({ error: 'Tâche introuvable.' });
      }
      return res.json({ task: updated, tasks: listTasks() });
    } catch (err) {
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.delete('/api/tasks/:id', (req, res) => {
    try {
      const removed = deleteTask(req.params.id);
      if (!removed) {
        return res.status(404).json({ error: 'Tâche introuvable.' });
      }
      return res.json({ removed, tasks: listTasks() });
    } catch (err) {
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { message, history, thinkingDepth, attachment } = req.body ?? {};
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Le message est requis.' });
      }
      const result = await runScientificAssistantChat({
        message,
        history,
        thinkingDepth,
        attachment,
      });
      return res.json(result);
    } catch (err) {
      console.error('[/api/chat error]', err);
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.post('/api/analyze', async (req, res) => {
    try {
      const { datasetText, focusPrompt, attachment } = req.body ?? {};
      if ((!datasetText || typeof datasetText !== 'string' || !datasetText.trim()) && !attachment) {
        return res.status(400).json({ error: 'Veuillez fournir des données ou un fichier à analyser.' });
      }
      const analysis = await analyzeComplexDataset({
        datasetText: datasetText ?? '',
        focusPrompt,
        attachment,
      });
      return res.json({ analysis });
    } catch (err) {
      console.error('[/api/analyze error]', err);
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.post('/api/tts', async (req, res) => {
    try {
      const { text } = req.body ?? {};
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Texte requis pour la synthèse vocale.' });
      }
      const speech = await synthesizeGideonSpeechWithVisemes(text);
      return res.json(speech);
    } catch (err) {
      console.error('[/api/tts error]', err);
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body ?? {};
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        return res.status(400).json({ error: 'Flux audio requis.' });
      }
      const transcript = await transcribeUserAudio({ audioBase64, mimeType });
      return res.json({ transcript });
    } catch (err) {
      console.error('[/api/transcribe error]', err);
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const liveWss = new WebSocketServer({ noServer: true });
  const streamWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    let pathname = '/';
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      pathname = url.pathname;
    } catch {
      pathname = request.url ?? '/';
    }

    if (pathname === '/ws/live') {
      liveWss.handleUpgrade(request, socket, head, (ws) => {
        liveWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/stream') {
      streamWss.handleUpgrade(request, socket, head, (ws) => {
        streamWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  streamWss.on('connection', (clientWs: WebSocket) => {
    let closed = false;

    const sendStream = (payload: unknown) => {
      if (!closed && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    sendStream({ type: 'stream:ready' });

    clientWs.on('message', async (raw) => {
      if (closed) return;
      let msg: {
        type?: string;
        requestId?: string;
        message?: string;
        history?: ChatTurn[];
        thinkingDepth?: string;
        attachment?: { mimeType: string; data: string; name: string };
        autoSpeak?: boolean;
        text?: string;
        sentiment?: SentimentMetadata;
      };

      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const requestId = msg.requestId || `req-${Date.now()}`;

      if (msg.type === 'ping') {
        sendStream({ type: 'pong', requestId });
        return;
      }

      if (msg.type === 'chat:send') {
        const messageText = typeof msg.message === 'string' ? msg.message.trim() : '';
        if (!messageText) {
          sendStream({ type: 'chat:error', requestId, error: 'Le message est requis.' });
          return;
        }

        sendStream({ type: 'chat:start', requestId });
        try {
          const result = await streamScientificAssistantChat({
            message: messageText,
            history: msg.history,
            thinkingDepth: msg.thinkingDepth,
            attachment: msg.attachment,
            shouldAbort: () => closed || clientWs.readyState !== WebSocket.OPEN,
            onToken: (delta, accumulatedVisibleText) => {
              sendStream({
                type: 'chat:token',
                requestId,
                delta,
                text: accumulatedVisibleText,
              });
            },
            onSentiment: (sentiment) => {
              sendStream({
                type: 'sentiment:update',
                requestId,
                sentiment,
              });
            },
            onTasksUpdated: (tasks, action) => {
              sendStream({
                type: 'tasks:updated',
                requestId,
                tasks,
                action,
              });
            },
          });

          sendStream({
            type: 'chat:complete',
            requestId,
            reply: result.reply,
            sentiment: result.sentiment,
            sources: result.sources,
            actions: result.actions,
            tasks: result.tasks,
          });

          if (msg.autoSpeak && !closed) {
            try {
              const speech = await synthesizeGideonSpeechWithVisemes(result.reply);
              sendStream({
                type: 'tts:payload',
                requestId,
                audioBase64: speech.audioBase64,
                mimeType: speech.mimeType,
                durationMs: speech.durationMs,
                visemes: speech.visemes,
                sentiment: result.sentiment,
              });
            } catch (ttsErr) {
              sendStream({
                type: 'tts:error',
                requestId,
                text: result.reply,
                error: formatGeminiError(ttsErr),
              });
            }
          }
        } catch (err) {
          console.error('[/ws/stream chat:send error]', err);
          sendStream({
            type: 'chat:error',
            requestId,
            error: formatGeminiError(err),
          });
        }
        return;
      }

      if (msg.type === 'tts:request') {
        const text = typeof msg.text === 'string' ? msg.text.trim() : '';
        if (!text) {
          sendStream({ type: 'tts:error', requestId, text: '', error: 'Texte requis.' });
          return;
        }
        try {
          const speech = await synthesizeGideonSpeechWithVisemes(text);
          const sentiment = msg.sentiment ?? analyzeProgressiveSentiment(text);
          sendStream({
            type: 'tts:payload',
            requestId,
            audioBase64: speech.audioBase64,
            mimeType: speech.mimeType,
            durationMs: speech.durationMs,
            visemes: speech.visemes,
            sentiment,
          });
        } catch (ttsErr) {
          console.error('[/ws/stream tts:request error]', ttsErr);
          sendStream({
            type: 'tts:error',
            requestId,
            text,
            error: formatGeminiError(ttsErr),
          });
        }
      }
    });

    clientWs.on('close', () => {
      closed = true;
    });
  });

  liveWss.on('connection', async (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<ReturnType<typeof getGeminiClient>['live']['connect']>> | null = null;
    let closed = false;

    const sendJson = (payload: unknown) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const connectLiveModel = async (useExtendedThinking: boolean) => {
      const ai = getGeminiClient('v1beta');
      const tasksSnapshot = listTasks();
      const systemInstruction = `${NAMUKUNZ_SYSTEM_INSTRUCTION}\n\nTâches actuelles :\n${JSON.stringify(
        tasksSnapshot.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          dueTime: t.dueTime,
          completed: t.completed,
        }))
      )}`;

      const model = useExtendedThinking ? 'gemini-3.8-live-extended-thinking' : 'gemini-3.8-live';

      return ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          ...(useExtendedThinking
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } }
            : {}),
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: buildTaskToolDeclarations(useExtendedThinking) }],
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            sendJson({ ready: true });
          },
          onmessage: (message: LiveServerMessage) => {
            if (closed) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              sendJson({ inputTranscript: content.inputTranscription.text });
            }
            if (content?.outputTranscription?.text) {
              sendJson({ outputTranscript: content.outputTranscription.text });
            }

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendJson({ audio: part.inlineData.data });
              }
            }

            if (content?.interrupted) {
              sendJson({ interrupted: true });
            }

            const status = content?.interactionStatus;
            if (status === InteractionStatus.IN_PROGRESS) {
              sendJson({ status: 'in_progress' });
            } else if (status === InteractionStatus.IDLE) {
              sendJson({ status: 'idle' });
            }

            const calls = message.toolCall?.functionCalls ?? [];
            if (calls.length > 0 && liveSession) {
              const functionResponses = calls.map((call) => {
                const outcome = executeTaskToolCall(
                  call.name ?? '',
                  (call.args ?? {}) as Record<string, unknown>
                );
                if (outcome.action) {
                  sendJson({
                    taskAction: outcome.action,
                    tasks: listTasks(),
                  });
                }
                return {
                  id: call.id,
                  name: call.name ?? '',
                  response: outcome.result as Record<string, unknown>,
                  ...(useExtendedThinking
                    ? { scheduling: FunctionResponseScheduling.WHEN_IDLE }
                    : {}),
                };
              });
              liveSession.sendToolResponse({ functionResponses });
            }
          },
          onerror: (err) => {
            console.error('[Live API error]', err);
            sendJson({ error: formatGeminiError(err) });
          },
          onclose: () => {
            sendJson({ closed: true });
          },
        },
      });
    };

    try {
      try {
        liveSession = await connectLiveModel(true);
      } catch (err) {
        console.warn('[Live extended thinking unavailable, falling back to gemini-3.8-live]', err);
        liveSession = await connectLiveModel(false);
      }
    } catch (err) {
      console.error('[Live connect failed]', err);
      sendJson({ error: formatGeminiError(err) });
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession || closed) return;
      try {
        const msg = JSON.parse(raw.toString()) as { audio?: string; text?: string };
        if (msg.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.text) {
          liveSession.sendRealtimeInput({ text: msg.text });
        }
      } catch (err) {
        console.error('[WS message parse error]', err);
      }
    });

    clientWs.on('close', () => {
      closed = true;
      try {
        liveSession?.close();
      } catch {
        // ignore close errors
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`namukunzAI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
