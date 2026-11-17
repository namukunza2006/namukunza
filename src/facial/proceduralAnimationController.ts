import {
  ARKIT_52_BLENDSHAPES,
  VISEME_CLASSES,
  blendVisemeProbabilitiesToARKit,
  createZeroARKitVector,
  type ARKitBlendshapeName,
  type ARKitBlendshapeVector,
  type VisemeClass,
} from './arkitBlendshapes';
import type { GideonState, SentimentMetadata } from '../types';
import type { VisemeInferenceResult } from './visemeInferenceEngine';

export interface ProceduralPoseState {
  blendshapes: ARKitBlendshapeVector;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  eyeGazeX: number;
  eyeGazeY: number;
  activeViseme: VisemeClass;
}

const DEFAULT_SENTIMENT: SentimentMetadata = {
  state: 'neutral',
  intensity: 0.45,
  complexity: 0.3,
  intent: 'idle',
};

/**
 * Procedural Animation Controller & Critically-Damped 52-Blendshape Smoother.
 * Combines real-time acoustic CNN viseme inference with optional server-exported
 * phoneme timelines, Sentiment Tracker emotional posture, and natural human
 * micro-variations (stochastic blinking, ocular micro-saccades, organic jitter)
 * while eliminating Uncanny Valley harshness via asymmetric co-articulation smoothing.
 */
export class ProceduralFaceController {
  private currentShapes: ARKitBlendshapeVector = createZeroARKitVector();
  private targetShapes: ARKitBlendshapeVector = createZeroARKitVector();
  private visemeBuffer: ARKitBlendshapeVector = createZeroARKitVector();
  private fusedProbs = new Float32Array(VISEME_CLASSES.length);

  private time = 0;
  private nextBlinkAt = 2.1;
  private blinkDuration = 0.16;
  private blinkProgress = -1;

  private nextSaccadeAt = 1.4;
  private targetGazeX = 0;
  private targetGazeY = 0;
  private curGazeX = 0;
  private curGazeY = 0;

  private curYaw = 0;
  private curPitch = 0;
  private curRoll = 0;

  private curSentimentIntensity = 0.45;

  public step(
    dtSeconds: number,
    state: GideonState,
    viseme: VisemeInferenceResult,
    sentiment: SentimentMetadata = DEFAULT_SENTIMENT,
    scheduledViseme?: { viseme: VisemeClass; weight: number } | null
  ): ProceduralPoseState {
    const dt = Math.min(0.05, Math.max(0.001, dtSeconds));
    this.time += dt;

    // 1. Fuse local CNN acoustic probabilities with exact TTS-exported phoneme viseme (when available)
    let activeViseme: VisemeClass = viseme.dominantViseme;
    if (state === 'speaking' && scheduledViseme) {
      const schedIdx = VISEME_CLASSES.indexOf(scheduledViseme.viseme);
      const hasAcoustic = viseme.rmsEnergy > 0.04;
      const schedBlend = hasAcoustic ? 0.62 * scheduledViseme.weight : 0.85 * scheduledViseme.weight;
      const cnnBlend = 1 - schedBlend;

      for (let i = 0; i < VISEME_CLASSES.length; i++) {
        this.fusedProbs[i] =
          viseme.probabilities[i] * cnnBlend + (i === schedIdx ? schedBlend : 0);
      }
      if (scheduledViseme.viseme !== 'sil' || !hasAcoustic) {
        activeViseme = scheduledViseme.viseme;
      }
    } else {
      this.fusedProbs.set(viseme.probabilities);
    }

    // 2. Map fused viseme probabilities into base mouth/jaw ARKit weights
    blendVisemeProbabilitiesToARKit(this.fusedProbs, this.visemeBuffer);
    for (const name of ARKIT_52_BLENDSHAPES) {
      this.targetShapes[name] = this.visemeBuffer[name];
    }

    const speaking = state === 'speaking';
    const listening = state === 'listening';
    const thinking = state === 'thinking';

    // 3. Natural stochastic human blinking (every 2.6 - 5.4 seconds, occasional double blink)
    if (this.time >= this.nextBlinkAt && this.blinkProgress < 0) {
      this.blinkProgress = 0;
      const doubleBlink = Math.random() < 0.16;
      this.nextBlinkAt = this.time + (doubleBlink ? 0.32 : 2.6 + Math.random() * 2.8);
    }

    let blinkLeft = 0;
    let blinkRight = 0;
    if (this.blinkProgress >= 0) {
      this.blinkProgress += dt / this.blinkDuration;
      if (this.blinkProgress >= 1) {
        this.blinkProgress = -1;
      } else {
        const p = this.blinkProgress;
        const curve =
          p < 0.38
            ? Math.sin((p / 0.38) * (Math.PI / 2))
            : Math.cos(((p - 0.38) / 0.62) * (Math.PI / 2));
        blinkLeft = Math.max(0, Math.min(1, curve));
        blinkRight = Math.max(0, Math.min(1, curve * 0.97));
      }
    }

    this.targetShapes.eyeBlinkLeft = blinkLeft;
    this.targetShapes.eyeBlinkRight = blinkRight;

    // 4. Ocular micro-saccades + subtle physiological ocular jitter (prevents wax-statue stare)
    if (this.time >= this.nextSaccadeAt) {
      if (thinking || sentiment.state === 'analytical') {
        this.targetGazeX = (Math.random() > 0.5 ? 1 : -1) * (0.28 + Math.random() * 0.34);
        this.targetGazeY = 0.22 + Math.random() * 0.22;
        this.nextSaccadeAt = this.time + 0.9 + Math.random() * 1.4;
      } else if (speaking) {
        this.targetGazeX = (Math.random() - 0.5) * 0.3;
        this.targetGazeY = (Math.random() - 0.5) * 0.18;
        this.nextSaccadeAt = this.time + 1.0 + Math.random() * 1.7;
      } else {
        this.targetGazeX = (Math.random() - 0.5) * 0.22;
        this.targetGazeY = (Math.random() - 0.5) * 0.14;
        this.nextSaccadeAt = this.time + 1.5 + Math.random() * 2.3;
      }
    }

    const microJitterX =
      Math.sin(this.time * 5.7) * 0.035 + Math.cos(this.time * 9.3) * 0.02;
    const microJitterY =
      Math.cos(this.time * 4.9) * 0.025 + Math.sin(this.time * 8.1) * 0.015;

    const gazeRate = 1 - Math.exp(-14 * dt);
    this.curGazeX += (this.targetGazeX + microJitterX - this.curGazeX) * gazeRate;
    this.curGazeY += (this.targetGazeY + microJitterY - this.curGazeY) * gazeRate;

    this.targetShapes.eyeLookOutLeft = Math.max(0, -this.curGazeX);
    this.targetShapes.eyeLookInLeft = Math.max(0, this.curGazeX);
    this.targetShapes.eyeLookInRight = Math.max(0, -this.curGazeX);
    this.targetShapes.eyeLookOutRight = Math.max(0, this.curGazeX);
    this.targetShapes.eyeLookUpLeft = Math.max(0, this.curGazeY);
    this.targetShapes.eyeLookUpRight = Math.max(0, this.curGazeY);
    this.targetShapes.eyeLookDownLeft = Math.max(0, -this.curGazeY);
    this.targetShapes.eyeLookDownRight = Math.max(0, -this.curGazeY);

    // 5. Sentiment Tracker driven facial posture (brows, Duchenne smile, focus squint)
    const energy = viseme.rmsEnergy;
    const centroid = viseme.spectralCentroidNorm;
    const targetIntensity = Math.max(0.15, Math.min(1, sentiment.intensity));
    this.curSentimentIntensity += (targetIntensity - this.curSentimentIntensity) * (1 - Math.exp(-4 * dt));
    const inten = this.curSentimentIntensity;
    const emo = sentiment.state;

    let warmSmile = speaking ? 0.11 + energy * 0.1 : listening ? 0.18 : 0.1;
    let browLift = 0;
    let browLiftAsym = 0;
    let browFurrow = 0;
    let eyeSquintExtra = 0;
    let eyeWideExtra = 0;

    if (emo === 'resolved' || emo === 'warm') {
      warmSmile = Math.max(warmSmile, (emo === 'resolved' ? 0.32 : 0.28) * inten + 0.08);
      browLift = 0.12 * inten;
      eyeSquintExtra = 0.16 * inten;
    } else if (emo === 'curious') {
      warmSmile = 0.1 * inten;
      browLift = 0.42 * inten;
      browLiftAsym = 0.14 * inten;
      eyeWideExtra = 0.2 * inten;
    } else if (emo === 'focused' || emo === 'alert') {
      warmSmile = 0.02;
      browFurrow = (emo === 'alert' ? 0.52 : 0.42) * inten;
      eyeSquintExtra = 0.18 * inten;
      this.targetShapes.mouthPressLeft = Math.max(this.targetShapes.mouthPressLeft, 0.12 * inten);
      this.targetShapes.mouthPressRight = Math.max(this.targetShapes.mouthPressRight, 0.12 * inten);
    } else if (emo === 'analytical') {
      warmSmile = 0.06;
      browFurrow = 0.24 * inten;
      browLift = 0.1 * inten;
    }

    if (speaking) {
      const browEmphasis = Math.min(
        0.48,
        energy * 0.36 + centroid * 0.32 + 0.09 * Math.sin(this.time * 2.2)
      );
      browLift = Math.max(browLift, browEmphasis * 0.65);
    } else if (listening) {
      browLift = Math.max(browLift, 0.22 + 0.05 * Math.sin(this.time * 1.4));
      eyeWideExtra = Math.max(eyeWideExtra, 0.15);
    } else if (thinking) {
      browFurrow = Math.max(browFurrow, 0.34 + 0.08 * Math.sin(this.time * 2.6));
      browLift = Math.max(browLift, 0.1);
    } else {
      browLift = Math.max(browLift, 0.05 * (0.5 + 0.5 * Math.sin(this.time * 0.9)));
    }

    this.targetShapes.mouthSmileLeft = Math.min(0.64, this.targetShapes.mouthSmileLeft + warmSmile);
    this.targetShapes.mouthSmileRight = Math.min(0.64, this.targetShapes.mouthSmileRight + warmSmile);
    this.targetShapes.cheekSquintLeft = Math.min(
      0.46,
      this.targetShapes.cheekSquintLeft + warmSmile * 0.68 + blinkLeft * 0.14
    );
    this.targetShapes.cheekSquintRight = Math.min(
      0.46,
      this.targetShapes.cheekSquintRight + warmSmile * 0.68 + blinkRight * 0.14
    );
    this.targetShapes.eyeSquintLeft = Math.min(0.65, warmSmile * 0.42 + blinkLeft * 0.25 + eyeSquintExtra);
    this.targetShapes.eyeSquintRight = Math.min(0.65, warmSmile * 0.42 + blinkRight * 0.25 + eyeSquintExtra);
    this.targetShapes.eyeWideLeft = Math.min(0.55, eyeWideExtra);
    this.targetShapes.eyeWideRight = Math.min(0.55, eyeWideExtra);

    this.targetShapes.browInnerUp = Math.min(0.75, browLift);
    this.targetShapes.browOuterUpLeft = Math.min(0.75, browLift * 0.85 + browLiftAsym);
    this.targetShapes.browOuterUpRight = Math.min(0.75, browLift * 0.85);
    this.targetShapes.browDownLeft = Math.min(0.75, browFurrow);
    this.targetShapes.browDownRight = Math.min(0.75, browFurrow);

    // 6. Smooth Asymmetric Co-Articulation Filtering across all 52 ARKit Blendshapes
    for (const name of ARKIT_52_BLENDSHAPES) {
      const target = this.targetShapes[name];
      const cur = this.currentShapes[name];
      const isBlink = name === 'eyeBlinkLeft' || name === 'eyeBlinkRight';
      const isMouth =
        name.startsWith('jaw') ||
        name.startsWith('mouth') ||
        name === 'tongueOut';

      const attackTau = isBlink ? 0.012 : isMouth ? 0.016 : 0.075;
      const releaseTau = isBlink ? 0.022 : isMouth ? 0.056 : 0.14;
      const tau = target > cur ? attackTau : releaseTau;
      const alpha = 1 - Math.exp(-dt / tau);
      this.currentShapes[name] = cur + (target - cur) * alpha;
    }

    // 7. Prosody + Sentiment coupled multi-harmonic 3D Head Motion + subtle breathing jitter
    const breatheYaw = Math.sin(this.time * 0.37) * 0.014 + Math.cos(this.time * 0.91) * 0.008;
    const breathePitch = Math.sin(this.time * 0.52) * 0.012;
    const curiousRoll = emo === 'curious' ? 0.048 * inten : emo === 'alert' ? -0.024 * inten : 0;

    const targetYaw =
      (speaking
        ? Math.sin(this.time * 1.15) * 0.058 + Math.cos(this.time * 0.42) * 0.028
        : listening
          ? Math.sin(this.time * 0.55) * 0.042
          : thinking
            ? -0.052 + Math.sin(this.time * 0.75) * 0.02
            : Math.sin(this.time * 0.35) * 0.024) + breatheYaw;

    const targetPitch =
      (speaking
        ? Math.sin(this.time * 2.2) * 0.026 - this.currentShapes.jawOpen * 0.045
        : listening
          ? -0.022 + Math.sin(this.time * 0.85) * 0.012
          : thinking
            ? 0.038
            : 0) + breathePitch;

    const targetRoll =
      (speaking
        ? Math.sin(this.time * 0.82) * 0.03
        : listening
          ? 0.032 + Math.sin(this.time * 0.48) * 0.012
          : Math.sin(this.time * 0.38) * 0.014) + curiousRoll;

    const headAlpha = 1 - Math.exp(-dt / 0.16);
    this.curYaw += (targetYaw - this.curYaw) * headAlpha;
    this.curPitch += (targetPitch - this.curPitch) * headAlpha;
    this.curRoll += (targetRoll - this.curRoll) * headAlpha;

    return {
      blendshapes: this.currentShapes,
      headYaw: this.curYaw,
      headPitch: this.curPitch,
      headRoll: this.curRoll,
      eyeGazeX: this.curGazeX,
      eyeGazeY: this.curGazeY,
      activeViseme,
    };
  }
}

export function getDominantExpressionSummary(b: ARKitBlendshapeVector): Record<ARKitBlendshapeName, number> {
  return b;
}
