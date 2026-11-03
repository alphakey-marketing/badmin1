import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from './types';

// Keep in step with the version in package.json.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

export interface PoseFrame {
  /** Image landmarks, normalised 0–1 (for drawing on the video). */
  image: Landmark[];
  /** World landmarks in metres, centred on the hips (for 3D angles). */
  world: Landmark[];
  /** Media time in seconds (real time of the recording). */
  t: number;
}

interface Options {
  /** Divides media time; set to 4 for a 120 fps clip that plays at 30 fps, etc. */
  slowMotionFactor: number;
  onFrame: (f: PoseFrame | null) => void;
  /** Called when a looping clip jumps back to the start. */
  onReset?: () => void;
}

function smooth(cur: Landmark[], prev: Landmark[] | null, a: number): Landmark[] {
  if (!prev || prev.length !== cur.length) return cur;
  return cur.map((p, i) => ({
    x: a * p.x + (1 - a) * prev[i].x,
    y: a * p.y + (1 - a) * prev[i].y,
    z: a * p.z + (1 - a) * prev[i].z,
    visibility: p.visibility,
  }));
}

export function usePose(videoRef: React.RefObject<HTMLVideoElement | null>, active: boolean, opts: Options) {
  const [ready, setReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const make = (delegate: 'GPU' | 'CPU') =>
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        let lm: PoseLandmarker;
        try {
          lm = await make('GPU');
        } catch {
          lm = await make('CPU');
        }
        if (cancelled) {
          lm.close();
          return;
        }
        landmarkerRef.current = lm;
        setReady(true);
      } catch (err) {
        console.error(err);
        if (!cancelled) setModelError('姿勢模型載入失敗，請檢查網絡後重新整理頁面。');
      }
    })();
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !active) return;
    let raf = 0;
    let lastVideoTime = -1;
    let lastTs = 0;
    let prevImg: Landmark[] | null = null;
    let prevWorld: Landmark[] | null = null;
    let frames = 0;
    let fpsStart = performance.now();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const v = videoRef.current;
      const lm = landmarkerRef.current;
      if (!v || !lm || v.readyState < 2 || v.currentTime === lastVideoTime) return;

      // A looping video jumps back: start the analysis fresh.
      if (v.currentTime < lastVideoTime) {
        prevImg = null;
        prevWorld = null;
        optsRef.current.onReset?.();
      }
      lastVideoTime = v.currentTime;

      // MediaPipe needs strictly increasing timestamps.
      const ts = Math.max(lastTs + 1, performance.now());
      lastTs = ts;
      const res = lm.detectForVideo(v, ts);
      if (res.landmarks?.length && res.worldLandmarks?.length) {
        prevImg = smooth(res.landmarks[0] as Landmark[], prevImg, 0.7);
        prevWorld = smooth(res.worldLandmarks[0] as Landmark[], prevWorld, 0.6);
        const mediaT = v.srcObject ? performance.now() / 1000 : v.currentTime / optsRef.current.slowMotionFactor;
        optsRef.current.onFrame({ image: prevImg, world: prevWorld, t: mediaT });
      } else {
        prevImg = null;
        prevWorld = null;
        optsRef.current.onFrame(null);
      }

      frames++;
      const now = performance.now();
      if (now - fpsStart > 1000) {
        setFps(Math.round((frames * 1000) / (now - fpsStart)));
        frames = 0;
        fpsStart = now;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, active, videoRef]);

  return { ready, modelError, fps };
}
