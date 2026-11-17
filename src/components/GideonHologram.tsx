import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Mic, MicOff, Radio, Square, VolumeX } from 'lucide-react';
import { VISEME_CLASSES, type VisemeClass } from '../facial/arkitBlendshapes';
import { ProceduralFaceController } from '../facial/proceduralAnimationController';
import { LocalVisemeCNNEngine } from '../facial/visemeInferenceEngine';
import type { SpeechFormants, VisemePlaybackState } from '../hooks/useGideonVoice';
import type { AvatarEmotionState, GideonState, SentimentMetadata } from '../types';

interface GideonHologramProps {
  state: GideonState;
  sentiment: SentimentMetadata;
  audioLevel: number;
  speechFormants: SpeechFormants;
  outputAnalyserRef: React.RefObject<AnalyserNode | null>;
  visemePlaybackRef: React.RefObject<VisemePlaybackState | null>;
  isLiveActive: boolean;
  isDictating: boolean;
  isSpeaking: boolean;
  isStreamConnected: boolean;
  liveCaption: { user: string; assistant: string };
  voiceError: string | null;
  onToggleLive: () => void;
  onToggleDictation: () => void;
  onStopSpeaking: () => void;
  onDismissError: () => void;
  prominent?: boolean;
}

const STATE_LABEL: Record<GideonState, string> = {
  idle: 'Présence active',
  listening: 'Écoute attentive',
  thinking: 'Réflexion neuronale',
  speaking: 'Expression vocale',
};

const SENTIMENT_LABEL: Record<AvatarEmotionState, string> = {
  neutral: 'Neutre',
  curious: 'Curieux',
  focused: 'Concentré',
  analytical: 'Analytique',
  resolved: 'Résolu',
  warm: 'Chaleureux',
  alert: 'Alerte',
};

const SENTIMENT_COLORS: Record<AvatarEmotionState, [number, number, number]> = {
  neutral: [0.2, 0.65, 0.98],
  curious: [0.35, 0.85, 1.0],
  focused: [0.24, 0.56, 0.96],
  analytical: [0.38, 0.72, 1.0],
  resolved: [0.22, 0.88, 0.82],
  warm: [0.32, 0.84, 0.94],
  alert: [0.96, 0.62, 0.28],
};

const HOLOGRAM_VERTEX_SHADER = `
  varying vec2 v_imgUv;
  varying float v_neuralPulse;

  uniform float u_time;
  uniform float u_jawOpen;
  uniform float u_mouthClose;
  uniform float u_mouthFunnel;
  uniform float u_mouthPucker;
  uniform float u_mouthSmile;
  uniform float u_mouthStretch;
  uniform float u_mouthLowerDown;
  uniform float u_mouthUpperUp;
  uniform float u_cheekSquint;
  uniform float u_blinkL;
  uniform float u_blinkR;
  uniform float u_browLift;
  uniform float u_browFurrow;
  uniform float u_audioLevel;

  float gauss2(vec2 p, vec2 c, vec2 s) {
    vec2 d = (p - c) / s;
    return exp(-dot(d, d));
  }

  void main() {
    // Convert Three.js PlaneGeometry UV (bottom-up) to top-down anatomical UV
    vec2 imgUv = vec2(uv.x, 1.0 - uv.y);

    float faceMask = gauss2(imgUv, vec2(0.50, 0.46), vec2(0.24, 0.40));
    float noseBridge = gauss2(imgUv, vec2(0.50, 0.47), vec2(0.045, 0.14));
    float cheekR = gauss2(imgUv, vec2(0.61, 0.51), vec2(0.08, 0.11));
    float cheekL = gauss2(imgUv, vec2(0.39, 0.51), vec2(0.08, 0.11));
    float jawDepth = gauss2(imgUv, vec2(0.50, 0.72), vec2(0.14, 0.16));

    float zDepth = faceMask * 0.34 + noseBridge * 0.16 + (cheekL + cheekR) * 0.08 + jawDepth * 0.06;

    float effectiveOpen = max(0.0, u_jawOpen * (1.0 - u_mouthClose * 0.85));
    float lowerLipZone = gauss2(imgUv, vec2(0.50, 0.725), vec2(0.105, 0.095)) * smoothstep(0.642, 0.675, imgUv.y);
    float upperLipZone = gauss2(imgUv, vec2(0.50, 0.625), vec2(0.085, 0.042)) * (1.0 - smoothstep(0.645, 0.668, imgUv.y));
    float jawFollow = gauss2(imgUv, vec2(0.50, 0.84), vec2(0.16, 0.13));

    vec2 disp = vec2(0.0);

    disp.y += (lowerLipZone * (0.056 * effectiveOpen + 0.022 * u_mouthLowerDown) + jawFollow * 0.030 * effectiveOpen);
    disp.y -= upperLipZone * (0.016 * effectiveOpen + 0.014 * u_mouthUpperUp);
    disp.y += (upperLipZone - lowerLipZone) * 0.012 * u_mouthClose;

    float leftCorner = gauss2(imgUv, vec2(0.432, 0.665), vec2(0.065, 0.055));
    float rightCorner = gauss2(imgUv, vec2(0.568, 0.665), vec2(0.065, 0.055));
    float widthDelta = 0.022 * u_mouthStretch - 0.026 * u_mouthPucker - 0.012 * u_mouthFunnel;
    disp.x += (rightCorner - leftCorner) * widthDelta;
    disp.y -= (leftCorner + rightCorner) * (0.024 * u_mouthSmile);

    disp.y -= (cheekL + cheekR) * (0.016 * u_cheekSquint + 0.004 * u_audioLevel);

    float eyeUpperL = gauss2(imgUv, vec2(0.415, 0.312), vec2(0.052, 0.032)) * (1.0 - smoothstep(0.328, 0.352, imgUv.y));
    float eyeLowerL = gauss2(imgUv, vec2(0.415, 0.362), vec2(0.048, 0.024)) * smoothstep(0.332, 0.355, imgUv.y);
    float eyeUpperR = gauss2(imgUv, vec2(0.585, 0.312), vec2(0.052, 0.032)) * (1.0 - smoothstep(0.328, 0.352, imgUv.y));
    float eyeLowerR = gauss2(imgUv, vec2(0.585, 0.362), vec2(0.048, 0.024)) * smoothstep(0.332, 0.355, imgUv.y);

    disp.y += eyeUpperL * 0.035 * u_blinkL - eyeLowerL * 0.012 * u_blinkL;
    disp.y += eyeUpperR * 0.035 * u_blinkR - eyeLowerR * 0.012 * u_blinkR;

    float browL = gauss2(imgUv, vec2(0.405, 0.195), vec2(0.075, 0.055));
    float browR = gauss2(imgUv, vec2(0.595, 0.195), vec2(0.075, 0.055));
    float innerBrowL = gauss2(imgUv, vec2(0.455, 0.205), vec2(0.045, 0.045));
    float innerBrowR = gauss2(imgUv, vec2(0.545, 0.205), vec2(0.045, 0.045));

    disp.y -= (browL + browR) * 0.022 * u_browLift;
    disp.y += (innerBrowL + innerBrowR) * 0.016 * u_browFurrow;
    disp.x += (innerBrowL - innerBrowR) * 0.014 * u_browFurrow;

    float pointRipple = sin(imgUv.x * 48.0 + u_time * 5.2) * cos(imgUv.y * 42.0 - u_time * 4.1);
    disp += faceMask * pointRipple * (0.001 + u_audioLevel * 0.0028);

    vec3 displaced = position;
    displaced.x += disp.x * 3.666;
    displaced.y -= disp.y * 2.0;
    displaced.z += zDepth;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    v_imgUv = imgUv;
    v_neuralPulse = faceMask * (0.5 + 0.5 * sin(u_time * 3.4 + imgUv.y * 14.0 - imgUv.x * 8.0));
  }
`;

const HOLOGRAM_FRAGMENT_SHADER = `
  varying vec2 v_imgUv;
  varying float v_neuralPulse;

  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_mouthOpen;
  uniform float u_mouthWidth;
  uniform float u_blinkL;
  uniform float u_blinkR;
  uniform float u_audioLevel;
  uniform float u_thinking;
  uniform vec2 u_eyeGaze;
  uniform vec3 u_sentimentColor;

  float ellipseMask(vec2 uv, vec2 center, vec2 radii) {
    vec2 d = (uv - center) / radii;
    return dot(d, d);
  }

  void main() {
    vec2 sampleUv = v_imgUv;

    float leftEyeSocket = 1.0 - smoothstep(0.65, 1.0, ellipseMask(v_imgUv, vec2(0.415, 0.338), vec2(0.036, 0.022)));
    float rightEyeSocket = 1.0 - smoothstep(0.65, 1.0, ellipseMask(v_imgUv, vec2(0.585, 0.338), vec2(0.036, 0.022)));
    sampleUv -= (leftEyeSocket + rightEyeSocket) * u_eyeGaze;

    // Three.js textures have flipY=true by default, so convert top-down imgUv.y to bottom-up sample
    vec2 texUv = vec2(clamp(sampleUv.x, 0.002, 0.998), clamp(1.0 - sampleUv.y, 0.002, 0.998));
    vec3 color = texture2D(u_texture, texUv).rgb;

    float cavityWidth = 0.054 + u_mouthWidth * 0.014;
    float cavityHeight = 0.002 + u_mouthOpen * 0.036;
    if (u_mouthOpen > 0.025) {
      float mDist = ellipseMask(v_imgUv, vec2(0.50, 0.662 + u_mouthOpen * 0.008), vec2(cavityWidth, cavityHeight));
      float interior = 1.0 - smoothstep(0.35, 1.0, mDist);
      float rim = smoothstep(0.65, 0.95, mDist) * (1.0 - smoothstep(0.95, 1.25, mDist));
      color = mix(color, vec3(0.015, 0.045, 0.095), interior * 0.9);
      color += u_sentimentColor * rim * u_mouthOpen * 0.35;
    }

    color *= (1.0 - leftEyeSocket * u_blinkL * 0.72);
    color *= (1.0 - rightEyeSocket * u_blinkR * 0.72);

    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    float nodeHighlight = smoothstep(0.48, 0.88, luma);
    float wave = 0.5 + 0.5 * sin(v_imgUv.y * 34.0 - u_time * (3.2 + u_thinking * 4.5));
    color += u_sentimentColor * nodeHighlight * (0.12 + u_audioLevel * 0.44 + v_neuralPulse * 0.2 * wave);

    vec2 edge = abs(v_imgUv - 0.5) * vec2(1.9, 1.95);
    float vignette = 1.0 - smoothstep(0.65, 1.05, length(edge));
    color *= mix(0.22, 1.0, vignette);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function detectSoftwareGl(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(renderer);
  } catch {
    return false;
  }
}

function getScheduledViseme(
  playback: VisemePlaybackState | null
): { viseme: VisemeClass; weight: number } | null {
  if (!playback || !playback.ctx || playback.timeline.length === 0) return null;
  const elapsedMs = (playback.ctx.currentTime - playback.startAudioTime) * 1000;
  if (elapsedMs < -20) return null;

  for (let i = 0; i < playback.timeline.length; i++) {
    const kf = playback.timeline[i];
    if (elapsedMs >= kf.timeMs && elapsedMs <= kf.timeMs + kf.durationMs) {
      const code = VISEME_CLASSES.includes(kf.viseme as VisemeClass)
        ? (kf.viseme as VisemeClass)
        : 'sil';
      return { viseme: code, weight: kf.weight };
    }
  }
  return null;
}

export const GideonHologram: React.FC<GideonHologramProps> = ({
  state,
  sentiment,
  audioLevel,
  speechFormants,
  outputAnalyserRef,
  visemePlaybackRef,
  isLiveActive,
  isDictating,
  isSpeaking,
  isStreamConnected,
  liveCaption,
  voiceError,
  onToggleLive,
  onToggleDictation,
  onStopSpeaking,
  onDismissError,
  prominent = true,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const sentimentRef = useRef(sentiment);
  const levelRef = useRef(audioLevel);
  const formantsRef = useRef(speechFormants);
  const liveActiveRef = useRef(isLiveActive);

  const [webglReady, setWebglReady] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [syncTelemetry, setSyncTelemetry] = useState<{
    viseme: VisemeClass;
    latencyMs: number;
  }>({ viseme: 'sil', latencyMs: 0 });

  stateRef.current = state;
  sentimentRef.current = sentiment;
  levelRef.current = audioLevel;
  formantsRef.current = speechFormants;
  liveActiveRef.current = isLiveActive;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: isSoftwareGl ? 'low-power' : 'high-performance',
      });
    } catch {
      setWebglReady(false);
      return;
    }

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x050810, 1);

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    mount.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050810);

    const initialW = Math.max(1, mount.clientWidth);
    const initialH = Math.max(1, mount.clientHeight);
    renderer.setSize(initialW, initialH, false);

    const camera = new THREE.PerspectiveCamera(38, initialW / initialH, 0.1, 20);
    camera.position.set(0, 0, 3.05);

    const headGroup = new THREE.Group();
    scene.add(headGroup);

    const imgAspect = 5632 / 3072;
    const planeHeight = 2.0;
    const planeWidth = planeHeight * imgAspect;
    const planeGeo = new THREE.PlaneGeometry(planeWidth, planeHeight, 96, 64);

    const uniforms = {
      u_texture: { value: null as THREE.Texture | null },
      u_time: { value: 0 },
      u_jawOpen: { value: 0 },
      u_mouthClose: { value: 0 },
      u_mouthFunnel: { value: 0 },
      u_mouthPucker: { value: 0 },
      u_mouthSmile: { value: 0 },
      u_mouthStretch: { value: 0 },
      u_mouthLowerDown: { value: 0 },
      u_mouthUpperUp: { value: 0 },
      u_cheekSquint: { value: 0 },
      u_blinkL: { value: 0 },
      u_blinkR: { value: 0 },
      u_browLift: { value: 0 },
      u_browFurrow: { value: 0 },
      u_audioLevel: { value: 0 },
      u_mouthOpen: { value: 0 },
      u_mouthWidth: { value: 0 },
      u_thinking: { value: 0 },
      u_eyeGaze: { value: new THREE.Vector2(0, 0) },
      u_sentimentColor: { value: new THREE.Vector3(0.2, 0.65, 0.98) },
    };

    const hologramMaterial = new THREE.ShaderMaterial({
      vertexShader: HOLOGRAM_VERTEX_SHADER,
      fragmentShader: HOLOGRAM_FRAGMENT_SHADER,
      uniforms,
      depthWrite: true,
    });

    const headMesh = new THREE.Mesh(planeGeo, hologramMaterial);
    headGroup.add(headMesh);

    const textureLoader = new THREE.TextureLoader();
    let loadedTexture: THREE.Texture | null = null;
    textureLoader.load(
      '/assets/aistudio/digital-face-representation_b8865c8f.jpg',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        loadedTexture = tex;
        uniforms.u_texture.value = tex;
        setImgLoaded(true);
      },
      undefined,
      () => {
        setWebglReady(false);
      }
    );

    // 3D Synaptic Facial Landmark Nodes + Edges synced to the exact Three.js headGroup pose
    const facialNodes = [
      { u: 0.36, v: 0.14, role: 'brow' },
      { u: 0.44, v: 0.12, role: 'brow' },
      { u: 0.56, v: 0.12, role: 'brow' },
      { u: 0.64, v: 0.14, role: 'brow' },
      { u: 0.36, v: 0.20, role: 'brow' },
      { u: 0.43, v: 0.19, role: 'brow' },
      { u: 0.57, v: 0.19, role: 'brow' },
      { u: 0.64, v: 0.20, role: 'brow' },
      { u: 0.34, v: 0.46, role: 'cheek' },
      { u: 0.39, v: 0.52, role: 'cheek' },
      { u: 0.61, v: 0.52, role: 'cheek' },
      { u: 0.66, v: 0.46, role: 'cheek' },
      { u: 0.50, v: 0.36, role: 'nose' },
      { u: 0.50, v: 0.49, role: 'nose' },
      { u: 0.44, v: 0.66, role: 'mouthL' },
      { u: 0.50, v: 0.62, role: 'lipTop' },
      { u: 0.50, v: 0.71, role: 'lipBot' },
      { u: 0.56, v: 0.66, role: 'mouthR' },
      { u: 0.42, v: 0.77, role: 'jaw' },
      { u: 0.50, v: 0.83, role: 'jaw' },
      { u: 0.58, v: 0.77, role: 'jaw' },
    ];

    const nodePositions = new Float32Array(facialNodes.length * 3);
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
    const nodeMat = new THREE.PointsMaterial({
      color: 0xe0f2fe,
      size: 0.036,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const nodePoints = new THREE.Points(nodeGeo, nodeMat);
    headGroup.add(nodePoints);

    const maxEdges = (facialNodes.length * (facialNodes.length - 1)) / 2;
    const linePositions = new Float32Array(maxEdges * 2 * 3);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeo.setDrawRange(0, 0);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const synapticLines = new THREE.LineSegments(lineGeo, lineMat);
    headGroup.add(synapticLines);

    const updateResponsiveScale = (w: number, h: number) => {
      const aspect = w / Math.max(1, h);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const visHeight = 2 * Math.tan(THREE.MathUtils.degToRad(38 * 0.5)) * 3.05;
      const visWidth = visHeight * aspect;
      const scale = Math.max(visHeight / planeHeight, visWidth / planeWidth) * (aspect < 1.2 ? 1.06 : 1.02);
      headGroup.scale.set(scale, scale, 1);
    };

    updateResponsiveScale(initialW, initialH);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(1, Math.floor(entry.contentRect.width));
        const h = Math.max(1, Math.floor(entry.contentRect.height));
        renderer.setSize(w, h, false);
        updateResponsiveScale(w, h);
      }
    });
    resizeObserver.observe(mount);

    const visemeEngine = new LocalVisemeCNNEngine();
    const proceduralController = new ProceduralFaceController();
    const fallbackProbs = new Float32Array(VISEME_CLASSES.length);
    const targetSentVec = new THREE.Vector3(0.2, 0.65, 0.98);
    const clock = new THREE.Clock();

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let disposed = false;
    let rafId = 0;
    let paceTimerId = 0;
    let elapsed = 0;
    let lastHudSync = 0;

    const gl2 = isSoftwareGl ? (renderer.getContext() as WebGL2RenderingContext) : null;
    const afterDraw = (nextFrame: (t: number) => void) => {
      if (!isSoftwareGl || !gl2 || typeof gl2.fenceSync !== 'function') {
        rafId = requestAnimationFrame(nextFrame);
        return;
      }
      const fence = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl2.flush();
      const checkFence = () => {
        if (disposed) return;
        if (!fence || gl2.getSyncParameter(fence, gl2.SYNC_STATUS) === gl2.SIGNALED) {
          if (fence) gl2.deleteSync(fence);
          paceTimerId = window.setTimeout(() => {
            if (!disposed) rafId = requestAnimationFrame(nextFrame);
          }, 80);
        } else {
          paceTimerId = window.setTimeout(checkFence, 4);
        }
      };
      paceTimerId = window.setTimeout(checkFence, 4);
    };

    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0.001, clock.getDelta()));
      if (!prefersReducedMotion) elapsed += dt;

      const st = stateRef.current;
      const curSent = sentimentRef.current;
      const analyser = outputAnalyserRef.current;

      // 1. Real-time local CNN viseme inference (< 2ms compute + 10.6ms FFT window)
      let visemeResult = visemeEngine.inferFromAnalyser(analyser, st === 'speaking');

      if (st === 'speaking' && visemeResult.rmsEnergy < 0.01 && formantsRef.current.amplitude > 0.05) {
        const tSynth = performance.now();
        fallbackProbs.fill(0);
        const f = formantsRef.current;
        fallbackProbs[10] = f.openness * 0.6;
        fallbackProbs[13] = (1 - f.width) * 0.4;
        fallbackProbs[11] = f.width * 0.4;
        visemeResult = {
          probabilities: fallbackProbs,
          dominantViseme: f.openness > 0.45 ? 'aa' : f.width > 0.55 ? 'E' : 'O',
          confidence: 0.85,
          inferenceLatencyMs: performance.now() - tSynth,
          rmsEnergy: f.amplitude,
          spectralCentroidNorm: f.brightness,
        };
      }

      // 2. Look up synchronized server-exported TTS phoneme viseme (locked to AudioContext time)
      const scheduled = st === 'speaking' ? getScheduledViseme(visemePlaybackRef.current) : null;

      // 3. Procedural controller + Sentiment Tracker posture + 52-ARKit spring-damper filter
      const pose = proceduralController.step(dt, st, visemeResult, curSent, scheduled);
      const b = pose.blendshapes;

      if (now - lastHudSync > 125) {
        lastHudSync = now;
        const totalPipelineMs =
          st === 'speaking' && analyser
            ? Number((10.67 + visemeResult.inferenceLatencyMs).toFixed(1))
            : Number(visemeResult.inferenceLatencyMs.toFixed(1));
        setSyncTelemetry({
          viseme: pose.activeViseme,
          latencyMs: totalPipelineMs,
        });
      }

      const lvl = Math.max(levelRef.current, visemeResult.rmsEnergy);
      const smileAvg = (b.mouthSmileLeft + b.mouthSmileRight) * 0.5;
      const stretchAvg = (b.mouthStretchLeft + b.mouthStretchRight) * 0.5;
      const lowerDownAvg = (b.mouthLowerDownLeft + b.mouthLowerDownRight) * 0.5;
      const upperUpAvg = (b.mouthUpperUpLeft + b.mouthUpperUpRight) * 0.5;
      const cheekSquintAvg = (b.cheekSquintLeft + b.cheekSquintRight) * 0.5;
      const browLiftAvg = (b.browInnerUp + b.browOuterUpLeft + b.browOuterUpRight) / 3;
      const browFurrowAvg = (b.browDownLeft + b.browDownRight) * 0.5;
      const effectiveOpen = Math.max(0, b.jawOpen * (1 - b.mouthClose * 0.85));
      const mouthWidthNet = stretchAvg - b.mouthPucker - b.mouthFunnel * 0.45;

      // Smoothly interpolate sentiment color tint
      const sc = SENTIMENT_COLORS[curSent.state] ?? SENTIMENT_COLORS.neutral;
      targetSentVec.set(sc[0], sc[1], sc[2]);
      uniforms.u_sentimentColor.value.lerp(targetSentVec, 1 - Math.exp(-5 * dt));

      uniforms.u_time.value = elapsed;
      uniforms.u_jawOpen.value = b.jawOpen;
      uniforms.u_mouthClose.value = b.mouthClose;
      uniforms.u_mouthFunnel.value = b.mouthFunnel;
      uniforms.u_mouthPucker.value = b.mouthPucker;
      uniforms.u_mouthSmile.value = smileAvg;
      uniforms.u_mouthStretch.value = stretchAvg;
      uniforms.u_mouthLowerDown.value = lowerDownAvg;
      uniforms.u_mouthUpperUp.value = upperUpAvg;
      uniforms.u_cheekSquint.value = cheekSquintAvg;
      uniforms.u_blinkL.value = b.eyeBlinkLeft;
      uniforms.u_blinkR.value = b.eyeBlinkRight;
      uniforms.u_browLift.value = browLiftAvg;
      uniforms.u_browFurrow.value = browFurrowAvg;
      uniforms.u_audioLevel.value = lvl;
      uniforms.u_mouthOpen.value = effectiveOpen;
      uniforms.u_mouthWidth.value = mouthWidthNet;
      uniforms.u_thinking.value = st === 'thinking' ? 1.0 : 0.0;
      uniforms.u_eyeGaze.value.set(pose.eyeGazeX * 0.011, pose.eyeGazeY * 0.008);

      // Apply 3D Head Rotation (Yaw, Pitch, Roll) directly to the Three.js headGroup
      headGroup.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);

      // Update 3D Synaptic Landmark Points + LineSegments
      for (let i = 0; i < facialNodes.length; i++) {
        const n = facialNodes[i];
        let du = 0;
        let dv = 0;
        if (n.role === 'brow') {
          dv -= 0.022 * browLiftAvg;
          dv += 0.016 * browFurrowAvg;
        } else if (n.role === 'cheek') {
          dv -= 0.016 * cheekSquintAvg + 0.004 * lvl;
        } else if (n.role === 'lipBot' || n.role === 'jaw') {
          dv += (n.role === 'lipBot' ? 0.056 : 0.03) * effectiveOpen;
        } else if (n.role === 'lipTop') {
          dv -= 0.016 * effectiveOpen;
        } else if (n.role === 'mouthL') {
          du -= 0.022 * mouthWidthNet;
          dv -= 0.024 * smileAvg;
        } else if (n.role === 'mouthR') {
          du += 0.022 * mouthWidthNet;
          dv -= 0.024 * smileAvg;
        }

        const jitterU = Math.sin(elapsed * 2.8 + i * 1.7) * (0.0014 + lvl * 0.004);
        const jitterV = Math.cos(elapsed * 2.4 + i * 2.1) * (0.0014 + lvl * 0.004);

        const x = (n.u - 0.5 + du + jitterU) * planeWidth;
        const y = (0.5 - n.v - dv - jitterV) * planeHeight;
        const dx = (n.u - 0.5) / 0.24;
        const dy = (n.v - 0.46) / 0.4;
        const z = 0.36 * Math.exp(-(dx * dx + dy * dy)) + 0.03;

        nodePositions[i * 3] = x;
        nodePositions[i * 3 + 1] = y;
        nodePositions[i * 3 + 2] = z;
      }
      nodeGeo.attributes.position.needsUpdate = true;
      nodeMat.opacity = 0.38 + lvl * 0.52;
      nodeMat.size = 0.028 + lvl * 0.02;

      if (st === 'speaking' || st === 'thinking' || liveActiveRef.current) {
        let edgeVertexCount = 0;
        for (let i = 0; i < facialNodes.length; i++) {
          const ax = nodePositions[i * 3];
          const ay = nodePositions[i * 3 + 1];
          const az = nodePositions[i * 3 + 2];
          for (let j = i + 1; j < facialNodes.length; j++) {
            const bx = nodePositions[j * 3];
            const by = nodePositions[j * 3 + 1];
            const bz = nodePositions[j * 3 + 2];
            const dist = Math.hypot(ax - bx, ay - by);
            if (dist < 0.48) {
              linePositions[edgeVertexCount * 3] = ax;
              linePositions[edgeVertexCount * 3 + 1] = ay;
              linePositions[edgeVertexCount * 3 + 2] = az;
              edgeVertexCount++;
              linePositions[edgeVertexCount * 3] = bx;
              linePositions[edgeVertexCount * 3 + 1] = by;
              linePositions[edgeVertexCount * 3 + 2] = bz;
              edgeVertexCount++;
            }
          }
        }
        lineGeo.setDrawRange(0, edgeVertexCount);
        lineGeo.attributes.position.needsUpdate = true;
        lineMat.opacity = 0.1 + lvl * 0.28;
      } else {
        lineGeo.setDrawRange(0, 0);
      }

      if (loadedTexture) {
        renderer.render(scene, camera);
      }

      if (!prefersReducedMotion) {
        afterDraw(tick);
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (paceTimerId) window.clearTimeout(paceTimerId);
      resizeObserver.disconnect();
      planeGeo.dispose();
      hologramMaterial.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      if (loadedTexture) loadedTexture.dispose();
      renderer.dispose();
      if (canvas.parentElement === mount) {
        mount.removeChild(canvas);
      }
    };
  }, [outputAnalyserRef, visemePlaybackRef]);

  return (
    <section
      aria-label="Projection holographique de namukunzAI"
      className="relative flex flex-col overflow-hidden rounded-2xl border border-sky-900/50 bg-[#050810] shadow-[0_0_60px_-15px_rgba(14,165,233,0.34)]"
    >
      <div
        className={`relative flex w-full items-center justify-center overflow-hidden bg-[#040914] ${
          prominent
            ? 'h-[400px] sm:h-[490px] lg:h-[580px]'
            : 'h-[310px] sm:h-[360px] lg:h-[410px]'
        }`}
      >
        {webglReady ? (
          <div ref={mountRef} className="absolute inset-0 h-full w-full" />
        ) : (
          <img
            src="/assets/aistudio/digital-face-representation_b8865c8f.jpg"
            alt="Hologramme neural namukunzAI"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover object-center"
          />
        )}

        {!imgLoaded && webglReady && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-sky-300/70">
            Initialisation du pont Three.js...
          </div>
        )}

        <div className="hologram-scanlines pointer-events-none absolute inset-0 z-20 opacity-60" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#050810] via-[#050810]/75 to-transparent px-4 pb-3 pt-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-sky-200">
              <span
                aria-hidden="true"
                className={
                  state === 'speaking'
                    ? 'text-sky-300'
                    : state === 'listening'
                      ? 'text-emerald-400'
                      : state === 'thinking'
                        ? 'text-amber-300'
                        : 'text-slate-400'
                }
              >
                ●
              </span>
              <span>{STATE_LABEL[state]}</span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span className="font-mono text-[11px] tabular-nums text-sky-300/90">
                {SENTIMENT_LABEL[sentiment.state]} {Math.round(sentiment.intensity * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-sky-300/85">
              <span>{isStreamConnected ? 'WS Continu' : 'WS Reconnexion'}</span>
              <span aria-hidden="true">·</span>
              <span>Visème {syncTelemetry.viseme}</span>
              <span aria-hidden="true">·</span>
              <span>{syncTelemetry.latencyMs.toFixed(1)} ms</span>
            </div>
          </div>

          {(liveCaption.user || liveCaption.assistant) && (
            <div className="mt-2 space-y-1 text-xs leading-relaxed">
              {liveCaption.user && (
                <p className="truncate text-slate-300">Vous : {liveCaption.user}</p>
              )}
              {liveCaption.assistant && (
                <p className="line-clamp-2 text-sky-200">namukunzAI : {liveCaption.assistant}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {voiceError && (
        <div className="flex items-center justify-between gap-3 border-t border-amber-500/30 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-200">
          <span>▲ {voiceError}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="min-h-[32px] px-2 font-medium text-amber-100 underline-offset-2 hover:underline"
          >
            Fermer
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 border-t border-sky-900/40 bg-[#0B1120] p-3">
        <button
          type="button"
          onClick={onToggleLive}
          className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 whitespace-nowrap ${
            isLiveActive
              ? 'bg-rose-500/90 text-white hover:bg-rose-500'
              : 'bg-sky-500 text-slate-950 hover:bg-sky-400'
          }`}
        >
          {isLiveActive ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              Arrêter Live
            </>
          ) : (
            <>
              <Radio className="h-4 w-4" aria-hidden="true" />
              Voix Live
            </>
          )}
        </button>

        {isSpeaking && !isLiveActive ? (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-sky-700/50 bg-[#0F172A] px-3 py-2 text-xs font-semibold text-sky-200 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 whitespace-nowrap"
          >
            <VolumeX className="h-4 w-4" aria-hidden="true" />
            Couper audio
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleDictation}
            className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 whitespace-nowrap ${
              isDictating
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                : 'border-sky-800/60 bg-[#0F172A] text-sky-100 hover:border-sky-600/60 hover:bg-slate-800'
            }`}
          >
            {isDictating ? (
              <>
                <MicOff className="h-4 w-4" aria-hidden="true" />
                Envoyer dictée
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" aria-hidden="true" />
                Dicter
              </>
            )}
          </button>
        )}
      </div>
    </section>
  );
};
