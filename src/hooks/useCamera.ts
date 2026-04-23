import { useCallback, useEffect, useRef, useState } from 'react';

type FacingMode = 'user' | 'environment';

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraFacing: FacingMode;
  toggleCamera: () => void;
  error: string | null;
  isLoading: boolean;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraFacing, setCameraFacing] = useState<FacingMode>('user');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async (facingMode: FacingMode) => {
    setIsLoading(true);
    setError(null);

    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {
          // play may be interrupted by next camera switch; ignore
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Camera error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    startCamera(cameraFacing);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraFacing]);

  const toggleCamera = useCallback(() => {
    setCameraFacing((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  return { videoRef, cameraFacing, toggleCamera, error, isLoading };
}
