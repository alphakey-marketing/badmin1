import type { FeedbackResult } from '../types';

interface Props {
  feedback: FeedbackResult | null;
}

const SEVERITY_CONFIG = {
  good:    { bg: 'rgba(34,197,94,0.85)',  border: '#22c55e', icon: '🟩' },
  warning: { bg: 'rgba(234,179,8,0.85)',  border: '#eab308', icon: '🟨' },
  error:   { bg: 'rgba(239,68,68,0.85)',  border: '#ef4444', icon: '🟥' },
};

export default function FeedbackDisplay({ feedback }: Props) {
  if (!feedback) return null;

  const config = SEVERITY_CONFIG[feedback.severity];

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '5%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: config.bg,
        border: `2px solid ${config.border}`,
        borderRadius: 12,
        padding: '10px 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        backdropFilter: 'blur(6px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        maxWidth: '80vw',
        zIndex: 20,
      }}
    >
      <span style={{ fontSize: 22 }}>{config.icon}</span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: '#fff',
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
        }}
      >
        {feedback.message}
      </span>
    </div>
  );
}
