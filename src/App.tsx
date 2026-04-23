import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from './hooks/useCamera';
import { usePoseLandmarker } from './hooks/usePoseLandmarker';
import { computeFeedback } from './utils/feedbackEngine';
import SkeletonOverlay from './components/SkeletonOverlay';
import FeedbackDisplay from './components/FeedbackDisplay';
import DebugPanel from './components/DebugPanel';
import CameraGuideCard from './components/CameraGuideCard';
import CameraControls from './components/CameraControls';
import type { CalibrationData, FeedbackResult, RacketHand, ShotMode, CameraAngle, Landmark } from './types';

export default function App() {
  const { videoRef, cameraFacing, toggleCamera, error, isLoading } = useCamera();
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { landmarks, isInitialized, fps } = usePoseLandmarker(videoRef, isVideoReady);

  const [feedback, setFeedback] = useState<FeedbackResult | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [racketHand, setRacketHand] = useState<RacketHand>('right');
  const [shotMode, setShotMode] = useState<ShotMode>('auto');
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('front');
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
  const feedbackRafRef = useRef<number | null>(null);
  const previousLandmarksRef = useRef<Landmark[] | null>(null);

  // Run feedback engine on each new landmarks frame
  useEffect(() => {
    if (!landmarks) {
      setFeedback(null);
      return;
    }
    if (feedbackRafRef.current) cancelAnimationFrame(feedbackRafRef.current);
    feedbackRafRef.current = requestAnimationFrame(() => {
      const result = computeFeedback(
        landmarks,
        racketHand,
        shotMode,
        previousLandmarksRef.current,
        calibration,
        cameraAngle,
      );
      previousLandmarksRef.current = landmarks;
      setFeedback(result);
    });
    return () => {
      if (feedbackRafRef.current) cancelAnimationFrame(feedbackRafRef.current);
    };
  }, [landmarks, racketHand, shotMode, calibration, cameraAngle]);

  const handleCalibrate = useCallback(() => {
    if (landmarks) {
      setCalibration({ landmarks: [...landmarks], timestamp: Date.now() });
    }
  }, [landmarks]);

  const handleVideoReady = useCallback(() => {
    setIsVideoReady(true);
  }, []);

  const problemJoints = feedback
    ? new Set<number>(feedback.problemJoints)
    : new Set<number>();

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Video + overlay container */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* Camera video */}
        <video
          ref={videoRef}
          onCanPlay={handleVideoReady}
          muted
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none',
          }}
        />

        {/* Skeleton canvas overlay */}
        <SkeletonOverlay
          landmarks={landmarks}
          videoRef={videoRef}
          problemJoints={problemJoints}
        />

        {/* Loading / status overlay */}
        {(isLoading || !isInitialized) && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(15,15,35,0.85)',
              borderRadius: 12,
              padding: '16px 28px',
              color: '#7dd3fc',
              fontSize: 15,
              fontWeight: 600,
              zIndex: 40,
              backdropFilter: 'blur(8px)',
            }}
          >
            {isLoading ? '📷 Accessing camera…' : '🤖 Loading pose model…'}
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(127,29,29,0.9)',
              borderRadius: 12,
              padding: '16px 28px',
              color: '#fca5a5',
              fontSize: 15,
              fontWeight: 600,
              zIndex: 40,
              maxWidth: '80vw',
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        )}

        {/* Camera guide card */}
        {showGuide && <CameraGuideCard onDismiss={() => setShowGuide(false)} />}

        {/* Camera + settings controls */}
        {!showGuide && (
          <CameraControls
            cameraFacing={cameraFacing}
            onToggleCamera={toggleCamera}
            racketHand={racketHand}
            onSetRacketHand={setRacketHand}
            shotMode={shotMode}
            onSetShotMode={setShotMode}
            cameraAngle={cameraAngle}
            onSetCameraAngle={setCameraAngle}
            onCalibrate={handleCalibrate}
            onResetCalibration={() => setCalibration(null)}
            hasCalibration={calibration !== null}
            showDebug={showDebug}
            onToggleDebug={() => setShowDebug((v) => !v)}
          />
        )}

        {/* Feedback banner */}
        <FeedbackDisplay feedback={feedback} />

        {/* Debug panel */}
        {showDebug && (
          <DebugPanel
            metrics={feedback?.details ?? null}
            fps={fps}
            visible={showDebug}
            onToggle={() => setShowDebug((v) => !v)}
          />
        )}

        {/* Calibration indicator */}
        {calibration && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              background: 'rgba(34,197,94,0.8)',
              borderRadius: 8,
              padding: '4px 12px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              zIndex: 25,
            }}
          >
            ✓ Calibrated
          </div>
        )}

        {/* Top header bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            padding: '10px 16px',
            background: 'linear-gradient(to bottom, rgba(15,15,35,0.75) 0%, transparent 100%)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: 20 }}>🏸</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', letterSpacing: 0.5 }}>
            Badminton Movement Feedback
          </span>
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              color: isInitialized ? '#86efac' : '#fcd34d',
              fontWeight: 600,
            }}
          >
            {isInitialized ? '● Live' : '○ Initializing'}
          </span>
        </div>
      </div>
    </div>
  );
}
