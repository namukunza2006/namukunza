export type VisemeCode =
  | 'sil'
  | 'PP'
  | 'FF'
  | 'TH'
  | 'DD'
  | 'kk'
  | 'CH'
  | 'SS'
  | 'nn'
  | 'RR'
  | 'aa'
  | 'E'
  | 'I'
  | 'O'
  | 'U';

export interface VisemeKeyframe {
  timeMs: number;
  durationMs: number;
  viseme: VisemeCode;
  phoneme: string;
  weight: number;
}

interface PhonemeToken {
  phoneme: string;
  viseme: VisemeCode;
  relDuration: number;
}

/**
 * Converts spoken French/technical text into a timed sequence of Phonemes & Visemes
 * aligned precisely to the generated WAV audio duration.
 */
export function generateAlignedVisemeTimeline(
  text: string,
  audioDurationMs: number
): VisemeKeyframe[] {
  const clean = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, (m) => {
      // Preserve accented vowel distinction via normalized fallback if needed
      return m;
    });

  const normalized = text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' bloc de code ')
    .replace(/[*_#`~>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || audioDurationMs <= 0) {
    return [{ timeMs: 0, durationMs: Math.max(100, audioDurationMs), viseme: 'sil', phoneme: '_', weight: 1 }];
  }

  const tokens: PhonemeToken[] = [{ phoneme: '_', viseme: 'sil', relDuration: 0.4 }];

  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i];
    const two = normalized.slice(i, i + 2);
    const three = normalized.slice(i, i + 3);

    if (ch === ' ' || ch === '\n') {
      tokens.push({ phoneme: '_', viseme: 'sil', relDuration: 0.35 });
      i += 1;
      continue;
    }
    if (ch === ',' || ch === ';' || ch === ':') {
      tokens.push({ phoneme: '_', viseme: 'sil', relDuration: 1.4 });
      i += 1;
      continue;
    }
    if (ch === '.' || ch === '!' || ch === '?') {
      tokens.push({ phoneme: '_', viseme: 'sil', relDuration: 2.3 });
      i += 1;
      continue;
    }

    // French multi-letter graphemes
    if (three === 'eau') {
      tokens.push({ phoneme: 'o', viseme: 'O', relDuration: 1.45 });
      i += 3;
      continue;
    }
    if (two === 'ou') {
      tokens.push({ phoneme: 'u', viseme: 'U', relDuration: 1.35 });
      i += 2;
      continue;
    }
    if (two === 'oi') {
      tokens.push({ phoneme: 'w', viseme: 'U', relDuration: 0.7 });
      tokens.push({ phoneme: 'a', viseme: 'aa', relDuration: 1.1 });
      i += 2;
      continue;
    }
    if (two === 'au') {
      tokens.push({ phoneme: 'o', viseme: 'O', relDuration: 1.3 });
      i += 2;
      continue;
    }
    if (two === 'ai' || two === 'ei') {
      tokens.push({ phoneme: 'ɛ', viseme: 'E', relDuration: 1.25 });
      i += 2;
      continue;
    }
    if (two === 'eu' || two === 'oe') {
      tokens.push({ phoneme: 'ø', viseme: 'E', relDuration: 1.25 });
      i += 2;
      continue;
    }
    if (two === 'ch') {
      tokens.push({ phoneme: 'ʃ', viseme: 'CH', relDuration: 1.05 });
      i += 2;
      continue;
    }
    if (two === 'gn') {
      tokens.push({ phoneme: 'ɲ', viseme: 'nn', relDuration: 0.9 });
      i += 2;
      continue;
    }
    if (two === 'ph') {
      tokens.push({ phoneme: 'f', viseme: 'FF', relDuration: 0.95 });
      i += 2;
      continue;
    }
    if (two === 'th') {
      tokens.push({ phoneme: 't', viseme: 'DD', relDuration: 0.8 });
      i += 2;
      continue;
    }
    if (two === 'qu') {
      tokens.push({ phoneme: 'k', viseme: 'kk', relDuration: 0.85 });
      i += 2;
      continue;
    }

    // Single characters
    if (ch === 'p' || ch === 'b' || ch === 'm') {
      tokens.push({ phoneme: ch, viseme: 'PP', relDuration: 0.85 });
    } else if (ch === 'f' || ch === 'v') {
      tokens.push({ phoneme: ch, viseme: 'FF', relDuration: 0.95 });
    } else if (ch === 't' || ch === 'd' || ch === 'n' || ch === 'l') {
      tokens.push({ phoneme: ch, viseme: 'DD', relDuration: 0.8 });
    } else if (ch === 'k' || ch === 'c' || ch === 'g' || ch === 'q') {
      tokens.push({ phoneme: ch, viseme: 'kk', relDuration: 0.85 });
    } else if (ch === 'j') {
      tokens.push({ phoneme: 'ʒ', viseme: 'CH', relDuration: 1.0 });
    } else if (ch === 's' || ch === 'z' || ch === 'x') {
      tokens.push({ phoneme: ch, viseme: 'SS', relDuration: 0.95 });
    } else if (ch === 'r') {
      tokens.push({ phoneme: 'ʁ', viseme: 'RR', relDuration: 0.85 });
    } else if (ch === 'a' || ch === 'à' || ch === 'â') {
      tokens.push({ phoneme: 'a', viseme: 'aa', relDuration: 1.3 });
    } else if (ch === 'e' || ch === 'é' || ch === 'è' || ch === 'ê' || ch === 'ë') {
      tokens.push({ phoneme: 'e', viseme: 'E', relDuration: 1.15 });
    } else if (ch === 'i' || ch === 'î' || ch === 'ï' || ch === 'y') {
      tokens.push({ phoneme: 'i', viseme: 'I', relDuration: 1.2 });
    } else if (ch === 'o' || ch === 'ô') {
      tokens.push({ phoneme: 'o', viseme: 'O', relDuration: 1.3 });
    } else if (ch === 'u' || ch === 'ù' || ch === 'û') {
      tokens.push({ phoneme: 'y', viseme: 'U', relDuration: 1.2 });
    } else if (ch === 'w') {
      tokens.push({ phoneme: 'w', viseme: 'U', relDuration: 0.9 });
    } else if (/[0-9]/.test(ch)) {
      tokens.push({ phoneme: 'a', viseme: 'aa', relDuration: 1.35 });
    }
    i += 1;
  }

  tokens.push({ phoneme: '_', viseme: 'sil', relDuration: 0.8 });

  // Merge consecutive identical visemes to avoid jittery rapid repeats
  const merged: PhonemeToken[] = [];
  for (const tok of tokens) {
    const prev = merged[merged.length - 1];
    if (prev && prev.viseme === tok.viseme) {
      prev.relDuration = Math.min(2.8, prev.relDuration + tok.relDuration * 0.65);
    } else {
      merged.push({ ...tok });
    }
  }

  const totalWeight = merged.reduce((acc, t) => acc + t.relDuration, 0) || 1;
  const keyframes: VisemeKeyframe[] = [];
  let cursorMs = 0;

  for (const tok of merged) {
    const durationMs = (tok.relDuration / totalWeight) * audioDurationMs;
    keyframes.push({
      timeMs: Math.round(cursorMs),
      durationMs: Math.round(durationMs),
      viseme: tok.viseme,
      phoneme: tok.phoneme,
      weight: tok.viseme === 'sil' ? 1.0 : 0.92,
    });
    cursorMs += durationMs;
  }

  return keyframes;
}

/**
 * Extracts audio duration in milliseconds from a 24kHz 16-bit mono WAV base64 payload.
 */
export function getWavDurationMs(base64Wav: string): number {
  const byteLen = Math.floor((base64Wav.length * 3) / 4);
  const pcmBytes = Math.max(0, byteLen - 44);
  // 24000 samples/sec * 2 bytes/sample = 48000 bytes/sec = 48 bytes/ms
  return Math.max(250, Math.round(pcmBytes / 48));
}
