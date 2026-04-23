interface Props {
  onDismiss: () => void;
}

const TIPS = [
  { icon: '📏', text: 'Stand 2–3 m from the camera so your full body is visible' },
  { icon: '📐', text: 'Position camera at chest/hip height, slightly angled up' },
  { icon: '💡', text: 'Ensure good lighting – face the light source if possible' },
  { icon: '👕', text: 'Wear fitted clothing to help pose detection' },
];

export default function CameraGuideCard({ onDismiss }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(15,15,35,0.95)',
        border: '1px solid rgba(125,211,252,0.3)',
        borderRadius: 16,
        padding: '24px 28px',
        maxWidth: 360,
        width: '90vw',
        zIndex: 50,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 16,
          color: '#7dd3fc',
          textAlign: 'center',
        }}
      >
        🏸 Camera Setup Tips
      </h2>

      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {TIPS.map((tip, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{tip.icon}</span>
            <span style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.5 }}>{tip.text}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onDismiss}
        style={{
          marginTop: 20,
          width: '100%',
          background: '#7dd3fc',
          color: '#0f172a',
          border: 'none',
          borderRadius: 10,
          padding: '10px 0',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Got it – Start Training!
      </button>
    </div>
  );
}
