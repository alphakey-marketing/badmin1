import type { RacketHand } from '../types';

interface Props {
  cameraFacing: 'user' | 'environment';
  onToggleCamera: () => void;
  racketHand: RacketHand;
  onSetRacketHand: (h: RacketHand) => void;
  onCalibrate: () => void;
  onResetCalibration: () => void;
  hasCalibration: boolean;
  showDebug: boolean;
  onToggleDebug: () => void;
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(30,30,60,0.85)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: '#e2e8f0',
  borderRadius: 8,
  padding: '6px 12px',
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export default function CameraControls({
  cameraFacing,
  onToggleCamera,
  racketHand,
  onSetRacketHand,
  onCalibrate,
  onResetCalibration,
  hasCalibration,
  showDebug,
  onToggleDebug,
}: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
      }}
    >
      {/* Camera facing toggle */}
      <button style={btnStyle} onClick={onToggleCamera}>
        {cameraFacing === 'user' ? '📷 Front Camera' : '📸 Rear Camera'}
      </button>

      {/* Racket hand selector */}
      <div
        style={{
          ...btnStyle,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
        }}
      >
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Racket:</span>
        <select
          value={racketHand}
          onChange={(e) => onSetRacketHand(e.target.value as RacketHand)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#e2e8f0',
            fontSize: 13,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="right" style={{ background: '#1e1e3c' }}>Right hand</option>
          <option value="left" style={{ background: '#1e1e3c' }}>Left hand</option>
        </select>
      </div>

      {/* Calibrate / Reset */}
      <button style={btnStyle} onClick={onCalibrate}>
        🎯 Calibrate
      </button>
      {hasCalibration && (
        <button
          style={{ ...btnStyle, color: '#fca5a5' }}
          onClick={onResetCalibration}
        >
          ✕ Reset Calibration
        </button>
      )}

      {/* Debug toggle */}
      <button
        style={{ ...btnStyle, color: showDebug ? '#7dd3fc' : '#94a3b8' }}
        onClick={onToggleDebug}
      >
        🔬 {showDebug ? 'Hide Debug' : 'Debug'}
      </button>
    </div>
  );
}
