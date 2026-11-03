import { Suspense, lazy, useEffect, useState } from 'react';

const CoachView = lazy(() => import('./coach/CoachView'));
const ShuttleLab = lazy(() => import('./physics/ShuttleLab'));
const DemoPage = lazy(() => import('./demo/DemoPage'));

type Tab = 'coach' | 'demo' | 'lab';

const fromHash = (): Tab => (location.hash === '#lab' ? 'lab' : location.hash === '#demo' ? 'demo' : 'coach');

export default function App() {
  const [tab, setTab] = useState<Tab>(fromHash);
  useEffect(() => {
    const onHash = () => setTab(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
  };
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>🏸</span>
          <span>羽毛球動作 × 物理實驗室</span>
        </div>
        <nav className="tabs">
          <button className={tab === 'coach' ? 'on' : ''} onClick={() => go('coach')}>動作教練</button>
          <button className={tab === 'demo' ? 'on' : ''} onClick={() => go('demo')}>示範動作</button>
          <button className={tab === 'lab' ? 'on' : ''} onClick={() => go('lab')}>3D 擊球物理</button>
        </nav>
      </header>
      <main className="main">
        <Suspense fallback={<div className="loading">載入中…</div>}>{tab === 'coach' ? <CoachView /> : tab === 'demo' ? <DemoPage /> : <ShuttleLab />}</Suspense>
      </main>
    </div>
  );
}
