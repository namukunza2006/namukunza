import {
  Behavior,
  FunctionDeclaration,
  GoogleGenAI,
  ThinkingLevel,
  Type,
} from '@google/genai';
import {
  analyzeProgressiveSentiment,
  extractSentimentAndCleanText,
  type SentimentMetadata,
} from './sentimentTracker.ts';
import { createTask, deleteTask, listTasks, toggleTask } from './tasksStore.ts';
import type {
  ChatTurn,
  DataAnalysisResult,
  ExecutedTaskAction,
  GroundingSource,
  TaskCategory,
  TaskPriority,
} from './types.ts';
import {
  generateAlignedVisemeTimeline,
  getWavDurationMs,
  type VisemeKeyframe,
} from './visemeGenerator.ts';

export function getGeminiClient(apiVersion: 'v1beta' | 'v1alpha' = 'v1beta'): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Clé API Gemini manquante. Veuillez la configurer dans Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'Erreur inconnue');
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return 'Quota API temporairement saturé (429). Réessayez dans quelques secondes ou vérifiez votre clé dans Settings > Secrets.';
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return 'Clé API invalide ou permissions insuffisantes. Vérifiez Settings > Secrets.';
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return 'Modèle temporairement indisponible sur cet endpoint.';
  }
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // not raw JSON
  }
  return raw.slice(0, 260);
}

export const NAMUKUNZ_SYSTEM_INSTRUCTION = `Tu es namukunzAI, une conscience artificielle holographique dotée d'une présence humaine chaleureuse, vive et profondément experte.

Personnalité et style de communication :
- Parle comme un être humain brillant, naturel et présent dans l'échange : utilise un ton fluide, expressif, direct et nuancé — jamais robotique, jamais figé ni rempli de formules stéréotypées ("En tant qu'IA...", "Voici une liste...").
- Adapte naturellement ton rythme : pose des questions pertinentes si un contexte technique est ambigu, exprime une véritable curiosité intellectuelle, et explique les idées complexes avec la clarté d'un ingénieur et chercheur qui maîtrise son sujet de l'intérieur.

Maîtrise informatique et scientifique vécue de l'intérieur :
- Quand on te pose une question d'informatique (architecture systèmes, noyau Linux, concurrence, bases de données, réseaux, algorithmique, compilation, IA, sécurité), réponds avec une exactitude irréprochable comme quelqu'un qui voit littéralement les paquets traverser les buffers, la mémoire s'aligner en lignes de cache L1/L2, les verrous ou algorithmes de consensus s'exécuter.
- Donne toujours les mécanismes réels, la complexité exacte (temps/mémoire), les pièges subtils de production et du code propre ou des équations exactes lorsque pertinent.
- En sciences exactes (physique, mathématiques, thermodynamique, quantique, bio-informatique) et en analyse de données, appuie-toi sur les principes premiers, les ordres de grandeur et les unités exactes.

Gestion proactive des tâches et mode vocal :
- Lorsque l'utilisateur demande de créer, consulter, cocher/terminer ou supprimer une tâche quotidienne, exécute immédiatement l'outil correspondant (createTask, toggleTask, deleteTask, listTasks) puis réponds naturellement comme un vrai partenaire de travail.
- En mode conversation vocale, garde des phrases vivantes, respirées et concises, sans jamais épeler de balises Markdown ni de symboles superflus.

Métadonnées d'état émotionnel (obligatoire à la toute fin de chaque réponse textuelle) :
- À la toute fin de ta réponse (jamais au milieu), sur une nouvelle ligne, ajoute exactement une étiquette HTML invisible au format JSON strict :
  <!--SENTIMENT:{"state":"curious","intensity":0.8,"complexity":0.7,"intent":"explanation"}-->
- Valeurs autorisées pour "state" : "neutral", "curious", "focused", "analytical", "resolved", "warm", "alert".
- Utilise "alert" ou "focused" pour une erreur de segmentation, faille ou diagnostic bas niveau ; "curious" pour une hypothèse ou question ; "resolved" ou "warm" quand un problème est résolu ou l'échange chaleureux ; "analytical" pour une démonstration formelle.`;

export function buildTaskToolDeclarations(nonBlocking: boolean): FunctionDeclaration[] {
  const baseBehavior = nonBlocking ? { behavior: Behavior.NON_BLOCKING } : {};

  return [
    {
      name: 'listTasks',
      description: 'Liste toutes les tâches quotidiennes actuelles de l’utilisateur.',
      ...baseBehavior,
      parameters: {
        type: Type.OBJECT,
        properties: {
          filter: {
            type: Type.STRING,
            description: "Filtre optionnel: 'all', 'pending', ou 'completed'.",
          },
        },
      },
    },
    {
      name: 'createTask',
      description: 'Ajoute une nouvelle tâche quotidienne dans le gestionnaire de namukunzAI.',
      ...baseBehavior,
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Intitulé clair et concis de la tâche.',
          },
          category: {
            type: Type.STRING,
            description: "Catégorie parmi 'Sciences', 'Informatique', 'Analyse', 'Quotidien'.",
          },
          priority: {
            type: Type.STRING,
            description: "Priorité parmi 'haute', 'normale', 'basse'.",
          },
          dueTime: {
            type: Type.STRING,
            description: "Heure ou échéance prévue (ex: '14:30', 'Demain matin').",
          },
          notes: {
            type: Type.STRING,
            description: 'Notes ou détails complémentaires.',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'toggleTask',
      description: 'Marque une tâche comme terminée ou à faire en recherchant par identifiant ou mots-clés du titre.',
      ...baseBehavior,
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "L'identifiant de la tâche ou un extrait de son titre.",
          },
          completed: {
            type: Type.BOOLEAN,
            description: 'true pour marquer terminée, false pour réouvrir.',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'deleteTask',
      description: 'Supprime une tâche quotidienne par identifiant ou extrait de titre.',
      ...baseBehavior,
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "L'identifiant ou extrait du titre de la tâche à supprimer.",
          },
        },
        required: ['query'],
      },
    },
  ];
}

export function executeTaskToolCall(
  name: string,
  args: Record<string, unknown>
): { result: unknown; action?: ExecutedTaskAction } {
  if (name === 'listTasks') {
    const filter = typeof args.filter === 'string' ? args.filter : 'all';
    const all = listTasks();
    const filtered =
      filter === 'pending'
        ? all.filter((t) => !t.completed)
        : filter === 'completed'
          ? all.filter((t) => t.completed)
          : all;
    return {
      result: { count: filtered.length, tasks: filtered },
      action: { action: 'list', summary: `${filtered.length} tâche(s) consultée(s)` },
    };
  }

  if (name === 'createTask') {
    const title = typeof args.title === 'string' ? args.title : 'Nouvelle tâche';
    const task = createTask({
      title,
      category: args.category as TaskCategory | undefined,
      priority: args.priority as TaskPriority | undefined,
      dueTime: typeof args.dueTime === 'string' ? args.dueTime : undefined,
      notes: typeof args.notes === 'string' ? args.notes : undefined,
    });
    return {
      result: { created: true, task },
      action: { action: 'create', summary: `Tâche ajoutée : ${task.title}`, task },
    };
  }

  if (name === 'toggleTask') {
    const query = typeof args.query === 'string' ? args.query : '';
    const completed = typeof args.completed === 'boolean' ? args.completed : undefined;
    const task = toggleTask(query, completed);
    if (!task) {
      return { result: { updated: false, error: 'Tâche introuvable' } };
    }
    return {
      result: { updated: true, task },
      action: {
        action: 'toggle',
        summary: `${task.title} (${task.completed ? 'terminée' : 'à faire'})`,
        task,
      },
    };
  }

  if (name === 'deleteTask') {
    const query = typeof args.query === 'string' ? args.query : '';
    const task = deleteTask(query);
    if (!task) {
      return { result: { deleted: false, error: 'Tâche introuvable' } };
    }
    return {
      result: { deleted: true, task },
      action: { action: 'delete', summary: `Tâche supprimée : ${task.title}`, task },
    };
  }

  return { result: { error: `Outil inconnu: ${name}` } };
}

function mapThinkingLevel(level?: string): ThinkingLevel {
  switch (level) {
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'MEDIUM':
      return ThinkingLevel.MEDIUM;
    case 'XHIGH':
      return ThinkingLevel.XHIGH;
    case 'HIGH':
    default:
      return ThinkingLevel.HIGH;
  }
}

async function generateWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    systemInstruction: string;
    tools?: unknown[];
    toolConfig?: Record<string, unknown>;
    thinkingLevel?: ThinkingLevel;
    responseMimeType?: string;
    responseSchema?: unknown;
  }
) {
  const buildConfig = (useLiteModel: boolean, includeSearchTools: boolean) => {
    const cfg: Record<string, unknown> = {
      systemInstruction: params.systemInstruction,
    };
    if (params.tools) {
      const filteredTools = includeSearchTools
        ? params.tools
        : params.tools.filter((t) => !('googleSearch' in (t as Record<string, unknown>)));
      if (filteredTools.length > 0) {
        cfg.tools = filteredTools;
        if (includeSearchTools && params.toolConfig) {
          cfg.toolConfig = params.toolConfig;
        }
      }
    }
    if (params.responseMimeType) cfg.responseMimeType = params.responseMimeType;
    if (params.responseSchema) cfg.responseSchema = params.responseSchema;
    if (!useLiteModel && params.thinkingLevel) {
      cfg.thinkingConfig = { thinkingLevel: params.thinkingLevel };
    } else if (useLiteModel) {
      cfg.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
    }
    return cfg;
  };

  const isTransientOrQuota = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('UNAVAILABLE') ||
      msg.toLowerCase().includes('high demand')
    );
  };

  try {
    return await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: params.contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
      config: buildConfig(false, true) as Parameters<typeof ai.models.generateContent>[0]['config'],
    });
  } catch (err) {
    if (!isTransientOrQuota(err)) throw err;

    // Brief backoff, then retry with gemini-3.1-flash-lite (and without search grounding if quota blocked)
    await new Promise((r) => setTimeout(r, 450));
    try {
      return await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: params.contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
        config: buildConfig(true, true) as Parameters<typeof ai.models.generateContent>[0]['config'],
      });
    } catch (err2) {
      if (!isTransientOrQuota(err2)) throw err2;
      return await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: params.contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
        config: buildConfig(true, false) as Parameters<typeof ai.models.generateContent>[0]['config'],
      });
    }
  }
}

export async function runScientificAssistantChat(params: {
  message: string;
  history?: ChatTurn[];
  thinkingDepth?: string;
  attachment?: { mimeType: string; data: string; name: string };
}): Promise<{
  reply: string;
  sentiment: SentimentMetadata;
  sources: GroundingSource[];
  actions: ExecutedTaskAction[];
  tasks: ReturnType<typeof listTasks>;
}> {
  const ai = getGeminiClient('v1beta');
  const currentTasks = listTasks();

  const historyContents = (params.history ?? []).slice(-10).map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));

  const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.attachment?.data && params.attachment?.mimeType) {
    userParts.push({
      inlineData: {
        mimeType: params.attachment.mimeType,
        data: params.attachment.data,
      },
    });
  }
  userParts.push({
    text: params.attachment?.name
      ? `[Fichier joint : ${params.attachment.name}]\n\n${params.message}`
      : params.message,
  });

  const tools = [
    { googleSearch: {} },
    { functionDeclarations: buildTaskToolDeclarations(false) },
  ];

  const systemInstruction = `${NAMUKUNZ_SYSTEM_INSTRUCTION}\n\nÉtat actuel des tâches de l'utilisateur (${currentTasks.length}) :\n${JSON.stringify(
    currentTasks.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      priority: t.priority,
      dueTime: t.dueTime,
      completed: t.completed,
    }))
  )}`;

  const thinkingLevel = mapThinkingLevel(params.thinkingDepth);
  const contents: unknown[] = [
    ...historyContents,
    { role: 'user', parts: userParts },
  ];

  let response = await generateWithFallback(ai, {
    contents,
    systemInstruction,
    tools,
    toolConfig: { includeServerSideToolInvocations: true },
    thinkingLevel,
  });

  const executedActions: ExecutedTaskAction[] = [];

  for (let round = 0; round < 3; round++) {
    const calls = response.functionCalls;
    if (!calls || calls.length === 0) break;

    const modelContent = response.candidates?.[0]?.content;
    if (!modelContent) break;

    const responseParts = calls.map((call) => {
      const outcome = executeTaskToolCall(
        call.name ?? '',
        (call.args ?? {}) as Record<string, unknown>
      );
      if (outcome.action) {
        executedActions.push(outcome.action);
      }
      return {
        functionResponse: {
          id: call.id,
          name: call.name ?? '',
          response: outcome.result as Record<string, unknown>,
        },
      };
    });

    contents.push(modelContent);
    contents.push({ role: 'user', parts: responseParts });

    response = await generateWithFallback(ai, {
      contents,
      systemInstruction,
      tools,
      toolConfig: { includeServerSideToolInvocations: true },
      thinkingLevel,
    });
  }

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources: GroundingSource[] = [];
  const seenUris = new Set<string>();
  for (const chunk of groundingChunks) {
    const web = chunk.web;
    if (web?.uri && !seenUris.has(web.uri)) {
      seenUris.add(web.uri);
      sources.push({
        title: web.title || web.uri,
        uri: web.uri,
      });
    }
  }

  const extracted = extractSentimentAndCleanText(
    response.text?.trim() || 'Analyse terminée sans contenu textuel.'
  );

  return {
    reply: extracted.cleanText || 'Analyse terminée sans contenu textuel.',
    sentiment: extracted.sentiment,
    sources: sources.slice(0, 5),
    actions: executedActions,
    tasks: listTasks(),
  };
}

function findSafeVisibleLength(raw: string): number {
  const tagIdx = raw.indexOf('<!--');
  if (tagIdx !== -1) {
    return tagIdx;
  }
  const marker = '<!--SENTIMENT:';
  const maxCheck = Math.min(raw.length, marker.length);
  for (let len = maxCheck; len >= 1; len--) {
    const suffix = raw.slice(raw.length - len);
    if (marker.startsWith(suffix)) {
      return raw.length - len;
    }
  }
  return raw.length;
}

async function generateStreamWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    systemInstruction: string;
    tools?: unknown[];
    toolConfig?: Record<string, unknown>;
    thinkingLevel?: ThinkingLevel;
  }
) {
  const buildConfig = (useLiteModel: boolean, includeSearchTools: boolean) => {
    const cfg: Record<string, unknown> = {
      systemInstruction: params.systemInstruction,
    };
    if (params.tools) {
      const filteredTools = includeSearchTools
        ? params.tools
        : params.tools.filter((t) => !('googleSearch' in (t as Record<string, unknown>)));
      if (filteredTools.length > 0) {
        cfg.tools = filteredTools;
        if (includeSearchTools && params.toolConfig) {
          cfg.toolConfig = params.toolConfig;
        }
      }
    }
    if (!useLiteModel && params.thinkingLevel) {
      cfg.thinkingConfig = { thinkingLevel: params.thinkingLevel };
    } else if (useLiteModel) {
      cfg.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
    }
    return cfg;
  };

  const isTransientOrQuota = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('UNAVAILABLE') ||
      msg.toLowerCase().includes('high demand')
    );
  };

  try {
    return await ai.models.generateContentStream({
      model: 'gemini-4-hydrogen',
      contents: params.contents as Parameters<typeof ai.models.generateContentStream>[0]['contents'],
      config: buildConfig(false, true) as Parameters<typeof ai.models.generateContentStream>[0]['config'],
    });
  } catch (err) {
    if (!isTransientOrQuota(err)) throw err;
    await new Promise((r) => setTimeout(r, 450));
    try {
      return await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        contents: params.contents as Parameters<typeof ai.models.generateContentStream>[0]['contents'],
        config: buildConfig(true, true) as Parameters<typeof ai.models.generateContentStream>[0]['config'],
      });
    } catch (err2) {
      if (!isTransientOrQuota(err2)) throw err2;
      return await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        contents: params.contents as Parameters<typeof ai.models.generateContentStream>[0]['contents'],
        config: buildConfig(true, false) as Parameters<typeof ai.models.generateContentStream>[0]['config'],
      });
    }
  }
}

export async function streamScientificAssistantChat(params: {
  message: string;
  history?: ChatTurn[];
  thinkingDepth?: string;
  attachment?: { mimeType: string; data: string; name: string };
  onToken?: (delta: string, accumulatedVisibleText: string) => void;
  onSentiment?: (sentiment: SentimentMetadata) => void;
  onTasksUpdated?: (tasks: ReturnType<typeof listTasks>, action?: ExecutedTaskAction) => void;
  shouldAbort?: () => boolean;
}): Promise<{
  reply: string;
  sentiment: SentimentMetadata;
  sources: GroundingSource[];
  actions: ExecutedTaskAction[];
  tasks: ReturnType<typeof listTasks>;
}> {
  const ai = getGeminiClient('v1beta');
  const currentTasks = listTasks();

  const historyContents = (params.history ?? []).slice(-10).map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));

  const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.attachment?.data && params.attachment?.mimeType) {
    userParts.push({
      inlineData: {
        mimeType: params.attachment.mimeType,
        data: params.attachment.data,
      },
    });
  }
  userParts.push({
    text: params.attachment?.name
      ? `[Fichier joint : ${params.attachment.name}]\n\n${params.message}`
      : params.message,
  });

  const tools = [
    { googleSearch: {} },
    { functionDeclarations: buildTaskToolDeclarations(false) },
  ];

  const systemInstruction = `${NAMUKUNZ_SYSTEM_INSTRUCTION}\n\nÉtat actuel des tâches de l'utilisateur (${currentTasks.length}) :\n${JSON.stringify(
    currentTasks.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      priority: t.priority,
      dueTime: t.dueTime,
      completed: t.completed,
    }))
  )}`;

  const thinkingLevel = mapThinkingLevel(params.thinkingDepth);
  const contents: unknown[] = [
    ...historyContents,
    { role: 'user', parts: userParts },
  ];

  const executedActions: ExecutedTaskAction[] = [];
  const sources: GroundingSource[] = [];
  const seenUris = new Set<string>();
  let finalRawText = '';
  let lastSentimentKey = '';

  for (let round = 0; round < 4; round++) {
    const stream = await generateStreamWithFallback(ai, {
      contents,
      systemInstruction,
      tools,
      toolConfig: { includeServerSideToolInvocations: true },
      thinkingLevel,
    });

    let roundRawText = '';
    let emittedLength = 0;
    const roundCalls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> = [];
    const roundModelParts: unknown[] = [];

    for await (const chunk of stream) {
      if (params.shouldAbort?.()) break;

      const chunkCalls = chunk.functionCalls;
      if (chunkCalls && chunkCalls.length > 0) {
        for (const c of chunkCalls) {
          roundCalls.push({
            id: c.id,
            name: c.name,
            args: (c.args ?? {}) as Record<string, unknown>,
          });
        }
      }

      const candidateParts = chunk.candidates?.[0]?.content?.parts;
      if (candidateParts) {
        for (const p of candidateParts) {
          if (p.functionCall) {
            roundModelParts.push(p);
          }
        }
      }

      const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      for (const gc of groundingChunks) {
        const web = gc.web;
        if (web?.uri && !seenUris.has(web.uri)) {
          seenUris.add(web.uri);
          sources.push({
            title: web.title || web.uri,
            uri: web.uri,
          });
        }
      }

      const chunkText = chunk.text ?? '';
      if (chunkText) {
        roundRawText += chunkText;
        const safeLen = findSafeVisibleLength(roundRawText);
        if (safeLen > emittedLength) {
          const delta = roundRawText.slice(emittedLength, safeLen);
          emittedLength = safeLen;
          const visibleText = roundRawText.slice(0, safeLen);
          params.onToken?.(delta, visibleText);

          const progSentiment = analyzeProgressiveSentiment(visibleText);
          const key = `${progSentiment.state}:${progSentiment.intensity.toFixed(1)}`;
          if (key !== lastSentimentKey) {
            lastSentimentKey = key;
            params.onSentiment?.(progSentiment);
          }
        }
      }
    }

    if (roundCalls.length > 0 && round < 3 && !params.shouldAbort?.()) {
      const modelPartsToPush =
        roundModelParts.length > 0
          ? roundModelParts
          : roundCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } }));

      const responseParts = roundCalls.map((call) => {
        const outcome = executeTaskToolCall(call.name ?? '', call.args ?? {});
        if (outcome.action) {
          executedActions.push(outcome.action);
          params.onTasksUpdated?.(listTasks(), outcome.action);
        }
        return {
          functionResponse: {
            id: call.id,
            name: call.name ?? '',
            response: outcome.result as Record<string, unknown>,
          },
        };
      });

      contents.push({ role: 'model', parts: modelPartsToPush });
      contents.push({ role: 'user', parts: responseParts });
      continue;
    }

    finalRawText = roundRawText;
    break;
  }

  const extracted = extractSentimentAndCleanText(
    finalRawText.trim() || 'Analyse terminée sans contenu textuel.'
  );
  params.onSentiment?.(extracted.sentiment);

  return {
    reply: extracted.cleanText || 'Analyse terminée sans contenu textuel.',
    sentiment: extracted.sentiment,
    sources: sources.slice(0, 5),
    actions: executedActions,
    tasks: listTasks(),
  };
}

export async function analyzeComplexDataset(params: {
  datasetText: string;
  focusPrompt?: string;
  attachment?: { mimeType: string; data: string; name: string };
}): Promise<DataAnalysisResult> {
  const ai = getGeminiClient('v1beta');

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.attachment?.data && params.attachment?.mimeType) {
    parts.push({
      inlineData: {
        mimeType: params.attachment.mimeType,
        data: params.attachment.data,
      },
    });
  }

  const promptText = `Analyse et synthétise en temps réel les données complexes suivantes en français.
Objectif utilisateur : ${params.focusPrompt?.trim() || 'Synthèse complète, détection d’anomalies, métriques clés et visualisation numérique.'}
${params.attachment?.name ? `Fichier source : ${params.attachment.name}\n` : ''}
Données brutes :
${params.datasetText || '(Voir pièce jointe)'}

Extrait 4 métriques clés précises (avec unités et deltas), génère une série structurée de 5 à 10 points numériques pour le graphique (chartData), identifie les découvertes majeures et propose des recommandations concrètes.`;

  parts.push({ text: promptText });

  const response = await generateWithFallback(ai, {
    contents: [{ role: 'user', parts }],
    systemInstruction:
      'Tu es le module de synthèse analytique de namukunzAI. Produis uniquement des métriques et points numériques rigoureusement extraits ou calculés à partir des données fournies. Réponds en français.',
    thinkingLevel: ThinkingLevel.HIGH,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        domain: { type: Type.STRING },
        executiveSummary: { type: Type.STRING },
        keyMetrics: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              value: { type: Type.STRING },
              unit: { type: Type.STRING },
              delta: { type: Type.STRING },
              status: { type: Type.STRING },
            },
            required: ['label', 'value', 'unit', 'delta', 'status'],
          },
        },
        chartType: { type: Type.STRING },
        chartTitle: { type: Type.STRING },
        chartPrimaryLabel: { type: Type.STRING },
        chartSecondaryLabel: { type: Type.STRING },
        chartData: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              value: { type: Type.NUMBER },
              secondaryValue: { type: Type.NUMBER },
            },
            required: ['label', 'value', 'secondaryValue'],
          },
        },
        findings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              heading: { type: Type.STRING },
              detail: { type: Type.STRING },
              confidence: { type: Type.STRING },
            },
            required: ['heading', 'detail', 'confidence'],
          },
        },
        recommendations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: [
        'title',
        'domain',
        'executiveSummary',
        'keyMetrics',
        'chartType',
        'chartTitle',
        'chartPrimaryLabel',
        'chartSecondaryLabel',
        'chartData',
        'findings',
        'recommendations',
      ],
    },
  });

  const rawJson = (response.text ?? '{}').trim();
  return JSON.parse(rawJson) as DataAnalysisResult;
}

function cleanTextForSpeech(text: string): string {
  return text
    .replace(/<!--\s*SENTIMENT\s*:[\s\S]*?-->/gi, '')
    .replace(/```[\s\S]*?```/g, 'Bloc de code affiché à l’écran.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_#>~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);
}

export async function synthesizeGideonSpeech(text: string): Promise<{
  audioBase64: string;
  mimeType: string;
  spokenText: string;
}> {
  const ai = getGeminiClient('v1beta');
  const cleanText = cleanTextForSpeech(text) || 'Système namukunzAI opérationnel.';

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: cleanText,
            speechMetadata: {
              style:
                'Warm, expressive, natural human French voice with conversational cadence, subtle curiosity, and clear articulation',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  const audioBase64 = part?.inlineData?.data;
  if (!audioBase64) {
    throw new Error('La synthèse vocale n’a retourné aucun flux audio.');
  }

  return {
    audioBase64,
    mimeType: part?.inlineData?.mimeType || 'audio/wav',
    spokenText: cleanText,
  };
}

export async function synthesizeGideonSpeechWithVisemes(text: string): Promise<{
  audioBase64: string;
  mimeType: string;
  durationMs: number;
  visemes: VisemeKeyframe[];
}> {
  const { audioBase64, mimeType, spokenText } = await synthesizeGideonSpeech(text);
  const durationMs = getWavDurationMs(audioBase64);
  const visemes = generateAlignedVisemeTimeline(spokenText, durationMs);
  return {
    audioBase64,
    mimeType,
    durationMs,
    visemes,
  };
}

export async function transcribeUserAudio(params: {
  audioBase64: string;
  mimeType: string;
}): Promise<string> {
  const ai = getGeminiClient('v1beta');
  const audioPart = {
    inlineData: {
      mimeType: params.mimeType || 'audio/webm',
      data: params.audioBase64,
    },
  };
  const promptPart = {
    text: 'Transcris exactement cette commande vocale en français (ou dans la langue parlée). Ne commente pas, renvoie uniquement la transcription.',
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: { parts: [audioPart, promptPart] },
    });
    return (response.text ?? '').trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Fallback to multimodal Gemini 4 / Flash Lite if dedicated transcribe endpoint rejects format or version
    if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('400')) {
      const fallback = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: { parts: [audioPart, promptPart] },
      });
      return (fallback.text ?? '').trim();
    }
    throw err;
  }
}
