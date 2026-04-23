import { useCallback, useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { Landmark } from '../types';
import { smoothLandmarks } from '../utils/poseUtils';

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const SMOOTH_ALPHA = 0.6;
const HISTORY_SIZE = 4;

interface UsePoseLandmarkerReturn {
  landmarks: Landmark[] | null;
  isInitialized: boolean;
  fps: number;
}

export function usePoseLandmarker(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  isVideoReady: boolean,
): UsePoseLandmarkerReturn {
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [fps, setFps] = useState(0);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const smoothedRef = useRef<Landmark[] | null>(null);
  const historyRef = useRef<Landmark[][]>([]);
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });

  // Initialize PoseLandmarker once
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        });

        if (!cancelled) {
          landmarkerRef.current = poseLandmarker;
          setIsInitialized(true);
        } else {
          poseLandmarker.close();
        }
      } catch (err) {
        console.error('Failed to initialize PoseLandmarker:', err);
      }
    }

    init();
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
    };
  }, []);

  /** Moving average over history frames */
  const averageLandmarks = useCallback((history: Landmark[][]): Landmark[] => {
    const n = history.length;
    if (n === 0) return [];
    const base = history[0];
    return base.map((_, i) => ({
      x: history.reduce((s, h) => s + h[i].x, 0) / n,
      y: history.reduce((s, h) => s + h[i].y, 0) / n,
      z: history.reduce((s, h) => s + h[i].z, 0) / n,
      visibility: history.reduce((s, h) => s + (h[i].visibility ?? 1), 0) / n,
    }));
  }, []);

  // Inference loop
  useEffect(() => {
    if (!isInitialized || !isVideoReady) return;

    function detect() {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (
        video &&
        landmarker &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
        lastVideoTimeRef.current = video.currentTime;
        const result = landmarker.detectForVideo(video, performance.now());

        if (result.landmarks && result.landmarks.length > 0) {
          const raw = result.landmarks[0] as Landmark[];

          // Maintain rolling history for moving average
          historyRef.current.push(raw);
          if (historyRef.current.length > HISTORY_SIZE) {
            historyRef.current.shift();
          }
          const averaged = averageLandmarks(historyRef.current);

          // Apply exponential smoothing on top
          const smoothed = smoothLandmarks(averaged, smoothedRef.current, SMOOTH_ALPHA);
          smoothedRef.current = smoothed;
          setLandmarks(smoothed);
        } else {
          smoothedRef.current = null;
          historyRef.current = [];
          setLandmarks(null);
        }

        // FPS tracking
        const counter = fpsCounterRef.current;
        counter.frames++;
        const now = performance.now();
        const elapsed = now - counter.lastTime;
        if (elapsed >= 1000) {
          setFps(Math.round((counter.frames * 1000) / elapsed));
          counter.frames = 0;
          counter.lastTime = now;
        }
      }

      rafRef.current = requestAnimationFrame(detect);
    }

    rafRef.current = requestAnimationFrame(detect);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isInitialized, isVideoReady, videoRef, averageLandmarks]);

  return { landmarks, isInitialized, fps };
}
