import { useCallback, useEffect, useRef, useState } from 'react';

export type SourceKind = 'camera' | 'file';
export type FacingMode = 'user' | 'environment';

/**
 * Feeds the <video> element from the camera or from an uploaded video file.
 * Uploaded clips are best for fast strokes: phones record 60–240 fps slow motion.
 */
export function useVideoSource() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const urlRef = useRef<string | null>(null);
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [facing, setFacing] = useState<FacingMode>('user');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const stopAll = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
      v.removeAttribute('src');
      v.load();
    }
  }, []);

  const startCamera = useCallback(
    async (mode: FacingMode = facing) => {
      setError(null);
      setLoading(true);
      stopAll();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
          audio: false,
        });
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.loop = false;
          await v.play().catch(() => undefined);
        }
        setKind('camera');
        setFacing(mode);
        setFileName(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`開唔到相機：${msg}。請檢查瀏覽器權限，或者改用「上載影片」。`);
        setKind(null);
      } finally {
        setLoading(false);
      }
    },
    [facing, stopAll],
  );

  const openFile = useCallback(
    async (file: File) => {
      setError(null);
      stopAll();
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      const v = videoRef.current;
      if (v) {
        v.src = url;
        v.loop = true;
        v.muted = true;
        await v.play().catch(() => undefined);
      }
      setKind('file');
      setFileName(file.name);
    },
    [stopAll],
  );

  const flipCamera = useCallback(() => {
    startCamera(facing === 'user' ? 'environment' : 'user');
  }, [facing, startCamera]);

  const stop = useCallback(() => {
    stopAll();
    setKind(null);
    setFileName(null);
  }, [stopAll]);

  useEffect(() => stopAll, [stopAll]);

  return { videoRef, kind, facing, error, loading, fileName, startCamera, openFile, flipCamera, stop };
}
