import { useState } from 'react';
import DemoView from './DemoView';
import { MOVES } from './moves';

/** Full-page demo: pick a move, watch it from any angle, copy the footwork and swing. */
export default function DemoPage() {
  const [moveId, setMoveId] = useState(MOVES[1].id);
  const [hand, setHand] = useState<'right' | 'left'>('right');
  return (
    <div className="demo-page">
      <div className="demo-head">
        <h2>示範動作：跟住做</h2>
        <div className="seg">
          <button className={hand === 'right' ? 'on' : ''} onClick={() => setHand('right')}>右手</button>
          <button className={hand === 'left' ? 'on' : ''} onClick={() => setHand('left')}>左手</button>
        </div>
      </div>
      <DemoView moveId={moveId} hand={hand} onMoveChange={setMoveId} showPicker />
    </div>
  );
}
