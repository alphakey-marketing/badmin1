import { Suspense, lazy, useEffect, useState } from 'react';

const CoachView = lazy(() => import('./coach/CoachView'));
const ShuttleLab = lazy(() => import('./physics/ShuttleLab'));

type Tab = 'coach' | 'lab';

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (location.hash === '#lab' ? 'lab' : 'coach'));
  useEffect(() => {
    const onHash = () => setTab(location.hash === '#lab' ? 'lab' : 'coach');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', t === 'lab' ? '#lab' : '#coach');
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
          <button className={tab === 'lab' ? 'on' : ''} onClick={() => go('lab')}>3D 旋轉物理</button>
        </nav>
      </header>
      <main className="main">
        <Suspense fallback={<div className="loading">載入中…</div>}>{tab === 'coach' ? <CoachView /> : <ShuttleLab />}</Suspense>
      </main>
    </div>
  );
}
