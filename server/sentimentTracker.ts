export type AvatarEmotionState =
  | 'neutral'
  | 'curious'
  | 'focused'
  | 'analytical'
  | 'resolved'
  | 'warm'
  | 'alert';

export interface SentimentMetadata {
  state: AvatarEmotionState;
  intensity: number;
  complexity: number;
  intent: string;
}

const REGEX_ALERT =
  /\b(erreur|segmentation|segfault|crash|critique|panique|faille|vulnérabilité|danger|alerte|bloquant|corruption|deadlock|overflow)\b/i;
const REGEX_CURIOUS =
  /(\?|pourquoi|comment|hypothèse|curieux|intéressant|explorons|fascinant|vérifions|supposons)/i;
const REGEX_FOCUSED =
  /\b(cache|l1|l2|mémoire|noyau|kernel|pointeur|thread|mutex|latence|complexité|algorithme|pipe|buffer|tcp|udp|assembleur|registre|optimis)\b/i;
const REGEX_RESOLVED =
  /\b(résolu|solution|voilà|parfait|trouvé|corrigé|optimisé|réussi|terminé|ajoutée|validé|confirmé|exactement)\b/i;
const REGEX_WARM =
  /\b(salut|bonjour|merci|avec plaisir|ravi|super|génial|bienvenue|ensemble|bravo)\b/i;

/**
 * Fast progressive Sentiment Tracker for streaming tokens (< 0.2ms per chunk).
 * Allows the Three.js avatar's brows, gaze, and smile to react live while tokens stream.
 */
export function analyzeProgressiveSentiment(text: string): SentimentMetadata {
  const sample = text.slice(-450);
  const lengthFactor = Math.min(1, text.length / 600);

  if (REGEX_ALERT.test(sample)) {
    return {
      state: 'alert',
      intensity: 0.78,
      complexity: Math.max(0.65, lengthFactor),
      intent: 'diagnostic',
    };
  }
  if (REGEX_CURIOUS.test(sample)) {
    return {
      state: 'curious',
      intensity: 0.76,
      complexity: Math.max(0.55, lengthFactor),
      intent: 'exploration',
    };
  }
  if (REGEX_RESOLVED.test(sample)) {
    return {
      state: 'resolved',
      intensity: 0.72,
      complexity: lengthFactor,
      intent: 'resolution',
    };
  }
  if (REGEX_WARM.test(sample)) {
    return {
      state: 'warm',
      intensity: 0.7,
      complexity: 0.35,
      intent: 'dialogue',
    };
  }
  if (REGEX_FOCUSED.test(sample)) {
    return {
      state: 'focused',
      intensity: 0.74,
      complexity: Math.max(0.7, lengthFactor),
      intent: 'engineering',
    };
  }
  return {
    state: text.length > 180 ? 'analytical' : 'neutral',
    intensity: text.length > 180 ? 0.62 : 0.45,
    complexity: lengthFactor,
    intent: 'explanation',
  };
}

/**
 * Strips any invisible <!--SENTIMENT:{...}--> metadata tag emitted by the model
 * and parses it into a validated SentimentMetadata object with heuristic fallback.
 */
export function extractSentimentAndCleanText(rawText: string): {
  cleanText: string;
  sentiment: SentimentMetadata;
} {
  const tagRegex = /<!--\s*SENTIMENT\s*:\s*(\{[\s\S]*?\})\s*-->/gi;
  let extracted: Partial<SentimentMetadata> | null = null;

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(rawText)) !== null) {
    try {
      extracted = JSON.parse(match[1]) as Partial<SentimentMetadata>;
    } catch {
      // ignore malformed tag
    }
  }

  const cleanText = rawText.replace(tagRegex, '').trim();
  const fallback = analyzeProgressiveSentiment(cleanText);

  const validStates: AvatarEmotionState[] = [
    'neutral',
    'curious',
    'focused',
    'analytical',
    'resolved',
    'warm',
    'alert',
  ];

  const state =
    extracted?.state && validStates.includes(extracted.state)
      ? extracted.state
      : fallback.state;

  const intensity =
    typeof extracted?.intensity === 'number' && !Number.isNaN(extracted.intensity)
      ? Math.max(0.1, Math.min(1, extracted.intensity))
      : fallback.intensity;

  const complexity =
    typeof extracted?.complexity === 'number' && !Number.isNaN(extracted.complexity)
      ? Math.max(0, Math.min(1, extracted.complexity))
      : fallback.complexity;

  return {
    cleanText,
    sentiment: {
      state,
      intensity,
      complexity,
      intent: typeof extracted?.intent === 'string' ? extracted.intent : fallback.intent,
    },
  };
}
