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
      <details className="card accuracy">
        <summary>📏 示範有幾準？有咩限制？</summary>
        <ul className="small">
          <li>
            <b>已核對：</b>每個動作嘅關鍵姿勢（蓄力膝頭、引拍同擊球手肘、弓步前膝、膝頭唔過腳尖、後腳伸直、發球高度）都用程式自動計角度，
            同研究或者教練參考範圍比較，全部 16 個動作都通過；而且檢查每隻落地嘅腳都踩得到地（唔會「浮腳」）。每步下面會顯示核對結果。
          </li>
          <li>
            <b>規則：</b>發球「成個球低過 1.15 米」同「雙腳唔可以離地移動」係 BWF 羽毛球規則 9.1。
          </li>
          <li>
            <b>肌肉：</b>紅色發光係嗰一步「主要用力」嘅肌群，係按一般運動生物力學整理嘅教學簡化，唔係肌電圖（EMG）實測。
          </li>
          <li>
            <b>限制：</b>人物係簡化模型。前臂內旋／外旋、手腕細動作、手指握拍只係用拍面方向表示；身高固定約 1.75 m；
            動作節奏係示意，唔係真實比賽速度；步法係常見教法之一，教練之間會有分別。
          </li>
          <li>
            <b>點樣再準：</b>(1) 用真人高手影片或者動作捕捉（mocap）數據做關鍵姿勢；(2) 用本 app「動作教練」嘅 3D 姿勢偵測抽取職業球員影片嘅角度再校正；
            (3) 換成有骨骼蒙皮嘅真人 3D 模型（例如 glTF 角色），配合肌肉貼圖，美術會更真實。
          </li>
        </ul>
      </details>
    </div>
  );
}
