import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyTask, ExecutedTaskAction, GideonState, VisemeKeyframe } from '../types';

export interface SpeechFormants {
  amplitude: number;
  openness: number;
  width: number;
  brightness: number;
}

export interface VisemePlaybackState {
  timeline: VisemeKeyframe[];
  startAudioTime: number;
  ctx: AudioContext | null;
}

interface UseGideonVoiceOptions {
  onLiveTranscript?: (role: 'user' | 'assistant', text: string) => void;
  onDictationResult?: (transcript: string) => void;
  onTasksUpdated?: (tasks: DailyTask[], action?: ExecutedTaskAction) => void;
}

function createAudioContextSafe(preferredRate: number): AudioContext {
  try {
    return new AudioContext({ sampleRate: preferredRate });
  } catch {
    return new AudioContext();
  }
}

function downsampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === 16000) return input;
  const ratio = sourceRate / 16000;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function float32ToPcm16Base64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(len / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

export function useGideonVoice(options: UseGideonVoiceOptions = {}) {
  const [gideonState, setGideonState] = useState<GideonState>('idle');
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechFormants, setSpeechFormants] = useState<SpeechFormants>({
    amplitude: 0,
    openness: 0,
    width: 0.5,
    brightness: 0,
  });
  const [liveCaption, setLiveCaption] = useState<{ user: string; assistant: string }>({
    user: '',
    assistant: '',
  });
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const liveUserAccRef = useRef('');
  const liveModelAccRef = useRef('');
  const isLiveActiveRef = useRef(false);
  const isDictatingRef = useRef(false);
  const isSyntheticSpeakingRef = useRef(false);
  const visemePlaybackRef = useRef<VisemePlaybackState | null>(null);

  const ensureOutputAudio = useCallback(() => {
    if (!outputCtxRef.current || outputCtxRef.current.state === 'closed') {
      outputCtxRef.current = createAudioContextSafe(24000);
    }
    if (outputCtxRef.current.state === 'suspended') {
      void outputCtxRef.current.resume();
    }
    if (!analyserRef.current) {
      const analyser = outputCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.45;
      analyser.connect(outputCtxRef.current.destination);
      analyserRef.current = analyser;
    }
    return { ctx: outputCtxRef.current, analyser: analyserRef.current };
  }, []);

  const stopAllPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // ignore already stopped
      }
    }
    activeSourcesRef.current.clear();
    visemePlaybackRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSyntheticSpeakingRef.current = false;

    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsSpeaking(false);
    if (!isLiveActiveRef.current && !isDictatingRef.current) {
      setGideonState('idle');
    } else if (isLiveActiveRef.current) {
      setGideonState('listening');
    }
  }, []);

  // Real-time multi-band formant & amplitude loop for lip-sync & facial expressions
  useEffect(() => {
    let active = true;
    const freqData = new Uint8Array(64);
    let synthPhase = 0;

    const tick = () => {
      if (!active) return;
      const analyser = analyserRef.current;

      if (isSyntheticSpeakingRef.current) {
        synthPhase += 0.24;
        const amp = Math.min(
          1,
          Math.max(0.12, 0.45 + 0.35 * Math.sin(synthPhase) * Math.cos(synthPhase * 0.43))
        );
        const openness = Math.min(1, amp * 1.15);
        const width = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(synthPhase * 0.7));
        setAudioLevel(amp);
        setSpeechFormants({ amplitude: amp, openness, width, brightness: amp * 0.8 });
      } else if (analyser && (isSpeaking || isLiveActiveRef.current || isDictatingRef.current)) {
        analyser.getByteFrequencyData(freqData);
        let low = 0;
        let mid = 0;
        let high = 0;
        for (let i = 1; i <= 5; i++) low += freqData[i];
        for (let i = 6; i <= 16; i++) mid += freqData[i];
        for (let i = 17; i <= 30; i++) high += freqData[i];

        const lowNorm = Math.min(1, (low / (5 * 255)) * 1.75);
        const midNorm = Math.min(1, (mid / (11 * 255)) * 2.1);
        const highNorm = Math.min(1, (high / (14 * 255)) * 2.4);
        const amp = Math.min(1, lowNorm * 0.45 + midNorm * 0.45 + highNorm * 0.1);

        setAudioLevel(amp);
        setSpeechFormants({
          amplitude: amp,
          openness: Math.min(1, lowNorm * 0.65 + midNorm * 0.55),
          width: Math.min(1, 0.3 + midNorm * 0.5 + highNorm * 0.35),
          brightness: Math.min(1, highNorm * 0.7 + midNorm * 0.3),
        });
      } else {
        setAudioLevel((prev) => (prev > 0.01 ? prev * 0.84 : 0));
        setSpeechFormants((prev) =>
          prev.amplitude > 0.01
            ? {
                amplitude: prev.amplitude * 0.82,
                openness: prev.openness * 0.78,
                width: 0.4 + (prev.width - 0.4) * 0.82,
                brightness: prev.brightness * 0.8,
              }
            : { amplitude: 0, openness: 0, width: 0.4, brightness: 0 }
        );
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isSpeaking]);

  const playPcmChunk24k = useCallback(
    (base64Audio: string) => {
      const { ctx, analyser } = ensureOutputAudio();
      const float32 = base64Pcm16ToFloat32(base64Audio);
      if (float32.length === 0) return;

      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(new Float32Array(float32), 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);

      const now = ctx.currentTime;
      const startAt = Math.max(now + 0.02, nextStartTimeRef.current);
      nextStartTimeRef.current = startAt + buffer.duration;

      activeSourcesRef.current.add(source);
      setIsSpeaking(true);
      setGideonState('speaking');

      source.onended = () => {
        activeSourcesRef.current.delete(source);
        if (activeSourcesRef.current.size === 0) {
          setIsSpeaking(false);
          if (isLiveActiveRef.current) {
            setGideonState('listening');
          } else {
            setGideonState('idle');
          }
        }
      };

      source.start(startAt);
    },
    [ensureOutputAudio]
  );

  const stopLiveSession = useCallback(() => {
    isLiveActiveRef.current = false;
    setIsLiveActive(false);

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputCtxRef.current && inputCtxRef.current.state !== 'closed') {
      void inputCtxRef.current.close();
      inputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    stopAllPlayback();

    if (liveUserAccRef.current.trim()) {
      optionsRef.current.onLiveTranscript?.('user', liveUserAccRef.current.trim());
      liveUserAccRef.current = '';
    }
    if (liveModelAccRef.current.trim()) {
      optionsRef.current.onLiveTranscript?.('assistant', liveModelAccRef.current.trim());
      liveModelAccRef.current = '';
    }
    setLiveCaption({ user: '', assistant: '' });
    setGideonState('idle');
  }, [stopAllPlayback]);

  const startLiveSession = useCallback(async () => {
    setVoiceError(null);
    if (isLiveActiveRef.current) {
      stopLiveSession();
      return;
    }

    try {
      ensureOutputAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      isLiveActiveRef.current = true;
      setIsLiveActive(true);
      setGideonState('listening');
      liveUserAccRef.current = '';
      liveModelAccRef.current = '';
      setLiveCaption({ user: '', assistant: '' });

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            ready?: boolean;
            audio?: string;
            inputTranscript?: string;
            outputTranscript?: string;
            interrupted?: boolean;
            status?: string;
            taskAction?: ExecutedTaskAction;
            tasks?: DailyTask[];
            error?: string;
            closed?: boolean;
          };

          if (msg.error) {
            setVoiceError(msg.error);
            stopLiveSession();
            return;
          }

          if (msg.audio) {
            playPcmChunk24k(msg.audio);
          }

          if (msg.inputTranscript) {
            if (liveModelAccRef.current.trim()) {
              optionsRef.current.onLiveTranscript?.('assistant', liveModelAccRef.current.trim());
              liveModelAccRef.current = '';
            }
            liveUserAccRef.current += msg.inputTranscript;
            setLiveCaption((prev) => ({ ...prev, user: liveUserAccRef.current }));
          }

          if (msg.outputTranscript) {
            if (liveUserAccRef.current.trim()) {
              optionsRef.current.onLiveTranscript?.('user', liveUserAccRef.current.trim());
              liveUserAccRef.current = '';
            }
            liveModelAccRef.current += msg.outputTranscript;
            setLiveCaption((prev) => ({ ...prev, assistant: liveModelAccRef.current }));
          }

          if (msg.interrupted) {
            stopAllPlayback();
          }

          if (msg.status === 'in_progress' && activeSourcesRef.current.size === 0) {
            setGideonState('thinking');
          } else if (msg.status === 'idle') {
            if (liveUserAccRef.current.trim()) {
              optionsRef.current.onLiveTranscript?.('user', liveUserAccRef.current.trim());
              liveUserAccRef.current = '';
            }
            if (liveModelAccRef.current.trim()) {
              optionsRef.current.onLiveTranscript?.('assistant', liveModelAccRef.current.trim());
              liveModelAccRef.current = '';
            }
            setLiveCaption({ user: '', assistant: '' });
            if (activeSourcesRef.current.size === 0 && isLiveActiveRef.current) {
              setGideonState('listening');
            }
          }

          if (msg.tasks) {
            optionsRef.current.onTasksUpdated?.(msg.tasks, msg.taskAction);
          }

          if (msg.closed && isLiveActiveRef.current) {
            stopLiveSession();
          }
        } catch (err) {
          console.error('[WS client parse error]', err);
        }
      };

      ws.onerror = () => {
        setVoiceError('Connexion vocale temps réel interrompue.');
        stopLiveSession();
      };

      ws.onopen = () => {
        const inputCtx = createAudioContextSafe(16000);
        inputCtxRef.current = inputCtx;
        if (inputCtx.state === 'suspended') {
          void inputCtx.resume();
        }
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        const silentGain = inputCtx.createGain();
        silentGain.gain.value = 0;

        processor.onaudioprocess = (e) => {
          if (!isLiveActiveRef.current || ws.readyState !== WebSocket.OPEN) return;
          const raw = e.inputBuffer.getChannelData(0);
          const downsampled = downsampleTo16k(raw, inputCtx.sampleRate);

          if (activeSourcesRef.current.size === 0) {
            let sumSq = 0;
            for (let i = 0; i < downsampled.length; i += 4) {
              sumSq += downsampled[i] * downsampled[i];
            }
            const rms = Math.sqrt(sumSq / (downsampled.length / 4));
            const lvl = Math.min(1, rms * 5.5);
            setAudioLevel(lvl);
          }

          const base64 = float32ToPcm16Base64(downsampled);
          ws.send(JSON.stringify({ audio: base64 }));
        };

        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(inputCtx.destination);
      };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Accès au microphone refusé ou indisponible sur cet appareil.';
      setVoiceError(message);
      stopLiveSession();
    }
  }, [ensureOutputAudio, playPcmChunk24k, stopAllPlayback, stopLiveSession]);

  const startDictation = useCallback(async () => {
    setVoiceError(null);
    if (isDictatingRef.current) return;
    if (isLiveActiveRef.current) stopLiveSession();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      recordedChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      const micCtx = new AudioContext();
      inputCtxRef.current = micCtx;
      const src = micCtx.createMediaStreamSource(stream);
      const micAnalyser = micCtx.createAnalyser();
      micAnalyser.fftSize = 128;
      src.connect(micAnalyser);
      analyserRef.current = micAnalyser;

      isDictatingRef.current = true;
      setIsDictating(true);
      setGideonState('listening');

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        isDictatingRef.current = false;
        setIsDictating(false);
        stream.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        if (inputCtxRef.current && inputCtxRef.current.state !== 'closed') {
          void inputCtxRef.current.close();
          inputCtxRef.current = null;
        }
        analyserRef.current = null;

        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        if (blob.size < 400) {
          setGideonState('idle');
          return;
        }

        setGideonState('thinking');
        try {
          const arrayBuf = await blob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const audioBase64 = btoa(binary);

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, mimeType: mimeType.split(';')[0] }),
          });
          const data = (await res.json()) as { transcript?: string; error?: string };
          if (!res.ok) throw new Error(data.error || 'Échec de transcription');

          setGideonState('idle');
          if (data.transcript) {
            optionsRef.current.onDictationResult?.(data.transcript);
          }
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : 'Erreur de transcription vocale.');
          setGideonState('idle');
        }
      };

      recorder.start();
    } catch (err) {
      setVoiceError(
        err instanceof Error ? err.message : 'Impossible d’accéder au microphone pour la dictée.'
      );
      setGideonState('idle');
    }
  }, [stopLiveSession]);

  const stopDictation = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const speakWithBrowserFallback = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    const clean = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[*_#>~`]/g, '')
      .trim()
      .slice(0, 900);
    if (!clean) return false;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.02;
    utterance.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find((v) => v.lang.startsWith('fr'));
    if (frVoice) utterance.voice = frVoice;

    utterance.onstart = () => {
      isSyntheticSpeakingRef.current = true;
      setIsSpeaking(true);
      setGideonState('speaking');
    };
    utterance.onend = () => {
      isSyntheticSpeakingRef.current = false;
      setIsSpeaking(false);
      setGideonState(isLiveActiveRef.current ? 'listening' : 'idle');
    };
    utterance.onerror = () => {
      isSyntheticSpeakingRef.current = false;
      setIsSpeaking(false);
      setGideonState('idle');
    };

    window.speechSynthesis.speak(utterance);
    return true;
  }, []);

  const playSynthesizedPayload = useCallback(
    async (payload: {
      audioBase64: string;
      visemes?: VisemeKeyframe[];
      fallbackText?: string;
    }) => {
      setVoiceError(null);
      stopAllPlayback();
      try {
        const { ctx, analyser } = ensureOutputAudio();
        const binary = atob(payload.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(analyser);

        const startAt = ctx.currentTime + 0.015;
        visemePlaybackRef.current =
          payload.visemes && payload.visemes.length > 0
            ? {
                timeline: payload.visemes,
                startAudioTime: startAt,
                ctx,
              }
            : null;

        activeSourcesRef.current.add(source);
        setIsSpeaking(true);
        setGideonState('speaking');

        source.onended = () => {
          activeSourcesRef.current.delete(source);
          if (activeSourcesRef.current.size === 0) {
            visemePlaybackRef.current = null;
            setIsSpeaking(false);
            setGideonState(isLiveActiveRef.current ? 'listening' : 'idle');
          }
        };

        source.start(startAt);
      } catch (err) {
        if (payload.fallbackText && speakWithBrowserFallback(payload.fallbackText)) {
          return;
        }
        setVoiceError(err instanceof Error ? err.message : 'Erreur de lecture vocale.');
        setIsSpeaking(false);
        setGideonState('idle');
      }
    },
    [ensureOutputAudio, speakWithBrowserFallback, stopAllPlayback]
  );

  const handleTtsStreamError = useCallback(
    (text: string, errMessage?: string) => {
      const usedFallback = text ? speakWithBrowserFallback(text) : false;
      if (!usedFallback) {
        if (errMessage) setVoiceError(errMessage);
        setIsSpeaking(false);
        setGideonState('idle');
      }
    },
    [speakWithBrowserFallback]
  );

  const speakText = useCallback(
    async (text: string, requestOverWs?: (cleanText: string) => boolean) => {
      setVoiceError(null);
      stopAllPlayback();
      setGideonState('thinking');

      if (requestOverWs && requestOverWs(text)) {
        return;
      }

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const data = (await res.json()) as {
          audioBase64?: string;
          visemes?: VisemeKeyframe[];
          error?: string;
        };
        if (!res.ok || !data.audioBase64) {
          throw new Error(data.error || 'Synthèse vocale indisponible.');
        }

        await playSynthesizedPayload({
          audioBase64: data.audioBase64,
          visemes: data.visemes,
          fallbackText: text,
        });
      } catch (err) {
        const usedFallback = speakWithBrowserFallback(text);
        if (!usedFallback) {
          setVoiceError(err instanceof Error ? err.message : 'Erreur de lecture vocale.');
          setIsSpeaking(false);
          setGideonState('idle');
        }
      }
    },
    [playSynthesizedPayload, speakWithBrowserFallback, stopAllPlayback]
  );

  useEffect(() => {
    return () => {
      stopLiveSession();
    };
  }, [stopLiveSession]);

  return {
    gideonState,
    setGideonState,
    isLiveActive,
    isDictating,
    isSpeaking,
    audioLevel,
    speechFormants,
    outputAnalyserRef: analyserRef,
    visemePlaybackRef,
    liveCaption,
    voiceError,
    clearVoiceError: () => setVoiceError(null),
    startLiveSession,
    stopLiveSession,
    startDictation,
    stopDictation,
    speakText,
    playSynthesizedPayload,
    handleTtsStreamError,
    stopSpeaking: stopAllPlayback,
  };
}
