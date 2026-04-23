import type { RacketHand, ShotMode, CameraAngle } from '../types';

interface Props {
  cameraFacing: 'user' | 'environment';
  onToggleCamera: () => void;
  racketHand: RacketHand;
  onSetRacketHand: (h: RacketHand) => void;
  shotMode: ShotMode;
  onSetShotMode: (m: ShotMode) => void;
  cameraAngle: CameraAngle;
  onSetCameraAngle: (a: CameraAngle) => void;
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

const selectStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#e2e8f0',
  fontSize: 13,
  cursor: 'pointer',
  outline: 'none',
};

export default function CameraControls({
  cameraFacing,
  onToggleCamera,
  racketHand,
  onSetRacketHand,
  shotMode,
  onSetShotMode,
  cameraAngle,
  onSetCameraAngle,
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
      <div style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Racket:</span>
        <select
          value={racketHand}
          onChange={(e) => onSetRacketHand(e.target.value as RacketHand)}
          style={selectStyle}
        >
          <option value="right" style={{ background: '#1e1e3c' }}>Right hand</option>
          <option value="left"  style={{ background: '#1e1e3c' }}>Left hand</option>
        </select>
      </div>

      {/* Shot mode selector */}
      <div style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Shot:</span>
        <select
          value={shotMode}
          onChange={(e) => onSetShotMode(e.target.value as ShotMode)}
          style={selectStyle}
        >
          <option value="auto"  style={{ background: '#1e1e3c' }}>Auto-detect</option>
          <option value="smash" style={{ background: '#1e1e3c' }}>Smash</option>
          <option value="clear" style={{ background: '#1e1e3c' }}>Clear</option>
          <option value="drop"  style={{ background: '#1e1e3c' }}>Drop</option>
          <option value="net"   style={{ background: '#1e1e3c' }}>Net shot</option>
        </select>
      </div>

      {/* Camera angle selector */}
      <div style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>View:</span>
        <select
          value={cameraAngle}
          onChange={(e) => onSetCameraAngle(e.target.value as CameraAngle)}
          style={selectStyle}
        >
          <option value="front" style={{ background: '#1e1e3c' }}>Front view</option>
          <option value="side"  style={{ background: '#1e1e3c' }}>Side view</option>
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
