export const ARKIT_52_BLENDSHAPES = [
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'noseSneerLeft',
  'noseSneerRight',
  'tongueOut',
] as const;

export type ARKitBlendshapeName = (typeof ARKIT_52_BLENDSHAPES)[number];
export type ARKitBlendshapeVector = Record<ARKitBlendshapeName, number>;

export const VISEME_CLASSES = [
  'sil', // Silence / rest
  'PP',  // /p/, /b/, /m/ (bilabials)
  'FF',  // /f/, /v/ (labiodentals)
  'TH',  // /θ/, /ð/ (dentals)
  'DD',  // /t/, /d/, /n/, /l/ (alveolars)
  'kk',  // /k/, /g/, /ŋ/ (velars)
  'CH',  // /ʃ/, /ʒ/, /tʃ/, /dʒ/ (postalveolars)
  'SS',  // /s/, /z/ (alveolar sibilants)
  'nn',  // /ɲ/, nasal resonance
  'RR',  // /ʁ/, /r/ (uvular / alveolar r)
  'aa',  // /a/, /ɑ/, /ɑ̃/ (open vowels)
  'E',   // /e/, /ɛ/, /ə/, /œ/ (mid-front vowels)
  'I',   // /i/, /j/ (high-front vowels)
  'O',   // /o/, /ɔ/, /ɔ̃/ (mid-back rounded)
  'U',   // /u/, /y/, /w/ (high rounded)
] as const;

export type VisemeClass = (typeof VISEME_CLASSES)[number];

/**
 * Canonical mapping from French & IPA TTS phonemes to 15 Viseme classes.
 */
export const PHONEME_TO_VISEME: Record<string, VisemeClass> = {
  // Silence & pause
  _: 'sil',
  sil: 'sil',
  pau: 'sil',
  // Bilabials
  p: 'PP',
  b: 'PP',
  m: 'PP',
  // Labiodentals
  f: 'FF',
  v: 'FF',
  // Dentals / Alveolars
  θ: 'TH',
  ð: 'TH',
  t: 'DD',
  d: 'DD',
  n: 'DD',
  l: 'DD',
  // Velars
  k: 'kk',
  g: 'kk',
  ŋ: 'kk',
  // Postalveolars
  ʃ: 'CH',
  ʒ: 'CH',
  tʃ: 'CH',
  dʒ: 'CH',
  // Sibilants
  s: 'SS',
  z: 'SS',
  // Palatal nasal
  ɲ: 'nn',
  // Rhotics
  ʁ: 'RR',
  r: 'RR',
  // Open vowels
  a: 'aa',
  ɑ: 'aa',
  ɑ̃: 'aa',
  // Mid-front vowels
  e: 'E',
  ɛ: 'E',
  ɛ̃: 'E',
  ə: 'E',
  ø: 'E',
  œ: 'E',
  // High-front vowels & glide
  i: 'I',
  j: 'I',
  // Mid-back rounded
  o: 'O',
  ɔ: 'O',
  ɔ̃: 'O',
  // High rounded & glides
  u: 'U',
  y: 'U',
  w: 'U',
  ɥ: 'U',
};

/**
 * Restrained, biomechanically calibrated 52-ARKit blendshape targets per viseme
 * to preserve natural articulation and avoid Uncanny Valley hyper-extension.
 */
export const VISEME_TO_ARKIT_WEIGHTS: Record<
  VisemeClass,
  Partial<Record<ARKitBlendshapeName, number>>
> = {
  sil: {
    jawOpen: 0.0,
    mouthClose: 0.14,
  },
  PP: {
    jawOpen: 0.0,
    mouthClose: 0.72,
    mouthPressLeft: 0.44,
    mouthPressRight: 0.44,
    mouthRollLower: 0.28,
    mouthRollUpper: 0.24,
  },
  FF: {
    jawOpen: 0.07,
    mouthRollLower: 0.42,
    mouthUpperUpLeft: 0.16,
    mouthUpperUpRight: 0.16,
    mouthLowerDownLeft: 0.12,
    mouthLowerDownRight: 0.12,
    mouthStretchLeft: 0.14,
    mouthStretchRight: 0.14,
  },
  TH: {
    jawOpen: 0.14,
    mouthStretchLeft: 0.18,
    mouthStretchRight: 0.18,
    mouthUpperUpLeft: 0.14,
    mouthUpperUpRight: 0.14,
    tongueOut: 0.16,
  },
  DD: {
    jawOpen: 0.18,
    mouthUpperUpLeft: 0.18,
    mouthUpperUpRight: 0.18,
    mouthLowerDownLeft: 0.18,
    mouthLowerDownRight: 0.18,
    mouthStretchLeft: 0.16,
    mouthStretchRight: 0.16,
  },
  kk: {
    jawOpen: 0.24,
    mouthLowerDownLeft: 0.16,
    mouthLowerDownRight: 0.16,
    mouthShrugUpper: 0.12,
  },
  CH: {
    jawOpen: 0.16,
    mouthFunnel: 0.48,
    mouthPucker: 0.22,
    mouthShrugUpper: 0.26,
    mouthUpperUpLeft: 0.14,
    mouthUpperUpRight: 0.14,
  },
  SS: {
    jawOpen: 0.09,
    mouthStretchLeft: 0.44,
    mouthStretchRight: 0.44,
    mouthSmileLeft: 0.16,
    mouthSmileRight: 0.16,
    mouthUpperUpLeft: 0.14,
    mouthUpperUpRight: 0.14,
    mouthLowerDownLeft: 0.12,
    mouthLowerDownRight: 0.12,
  },
  nn: {
    jawOpen: 0.12,
    mouthClose: 0.22,
    mouthStretchLeft: 0.2,
    mouthStretchRight: 0.2,
  },
  RR: {
    jawOpen: 0.2,
    mouthFunnel: 0.26,
    mouthPucker: 0.18,
    mouthRollLower: 0.12,
  },
  aa: {
    jawOpen: 0.62,
    mouthLowerDownLeft: 0.46,
    mouthLowerDownRight: 0.46,
    mouthUpperUpLeft: 0.2,
    mouthUpperUpRight: 0.2,
    cheekSquintLeft: 0.08,
    cheekSquintRight: 0.08,
  },
  E: {
    jawOpen: 0.34,
    mouthStretchLeft: 0.36,
    mouthStretchRight: 0.36,
    mouthSmileLeft: 0.24,
    mouthSmileRight: 0.24,
    mouthLowerDownLeft: 0.24,
    mouthLowerDownRight: 0.24,
  },
  I: {
    jawOpen: 0.16,
    mouthSmileLeft: 0.46,
    mouthSmileRight: 0.46,
    mouthStretchLeft: 0.48,
    mouthStretchRight: 0.48,
    cheekSquintLeft: 0.14,
    cheekSquintRight: 0.14,
  },
  O: {
    jawOpen: 0.38,
    mouthFunnel: 0.62,
    mouthPucker: 0.42,
    mouthShrugLower: 0.18,
  },
  U: {
    jawOpen: 0.14,
    mouthPucker: 0.68,
    mouthFunnel: 0.38,
    mouthShrugLower: 0.24,
    mouthShrugUpper: 0.16,
  },
};

export function createZeroARKitVector(): ARKitBlendshapeVector {
  const vec = {} as ARKitBlendshapeVector;
  for (const name of ARKIT_52_BLENDSHAPES) {
    vec[name] = 0;
  }
  return vec;
}

/**
 * Computes weighted 52-ARKit blendshape targets from a probability distribution
 * across the 15 visemes, enforcing biomechanical co-articulation invariants.
 */
export function blendVisemeProbabilitiesToARKit(
  probs: Float32Array,
  out: ARKitBlendshapeVector
): ARKitBlendshapeVector {
  for (const name of ARKIT_52_BLENDSHAPES) {
    out[name] = 0;
  }

  for (let i = 0; i < VISEME_CLASSES.length; i++) {
    const p = probs[i];
    if (p < 0.01) continue;
    const weights = VISEME_TO_ARKIT_WEIGHTS[VISEME_CLASSES[i]];
    for (const key in weights) {
      const k = key as ARKitBlendshapeName;
      const w = weights[k];
      if (w !== undefined) {
        out[k] += p * w;
      }
    }
  }

  // Mutual biomechanical inhibition: bilabial closure suppresses conflicting jaw drop
  if (out.mouthClose > 0.25) {
    const inhibit = Math.max(0, 1 - out.mouthClose * 0.92);
    out.jawOpen *= inhibit;
    out.mouthLowerDownLeft *= inhibit;
    out.mouthLowerDownRight *= inhibit;
  }

  return out;
}
