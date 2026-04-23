import type { PoseMetrics } from '../types';

interface Props {
  metrics: PoseMetrics | null;
  fps: number;
  visible: boolean;
  onToggle: () => void;
}

function fmt(v: number | null): string {
  return v !== null ? `${v.toFixed(1)}°` : '–';
}

function fmtRatio(v: number | null): string {
  return v !== null ? v.toFixed(2) : '–';
}

export default function DebugPanel({ metrics, fps, visible, onToggle }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          background: 'rgba(30,30,50,0.85)',
          border: '1px solid rgba(255,255,255,0.2)',
          color: '#ccc',
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {visible ? 'Hide Debug' : 'Show Debug'}
      </button>

      {visible && metrics && (
        <div
          style={{
            background: 'rgba(15,15,30,0.9)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            color: '#e2e8f0',
            lineHeight: 1.7,
            minWidth: 210,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#7dd3fc' }}>
            Debug Metrics
          </div>
          <div>L Elbow: {fmt(metrics.leftElbowAngle)}</div>
          <div>R Elbow: {fmt(metrics.rightElbowAngle)}</div>
          <div>L Knee: {fmt(metrics.leftKneeAngle)}</div>
          <div>R Knee: {fmt(metrics.rightKneeAngle)}</div>
          <div>Stance ratio: {fmtRatio(metrics.stanceWidthRatio)}</div>
          <div style={{ marginTop: 4, color: '#a78bfa' }}>FPS: {fps}</div>
        </div>
      )}
    </div>
  );
}
