import { useState } from 'react';
import catalog from '../../docs/tai-tzu-ying/catalog.json';
import { CATEGORIES, MOVES } from './moves';
import './tai-study.css';

type Clip = (typeof catalog.clips)[number];
const time = (seconds: number) => {
  const remainder = seconds % 60;
  const digits = Number.isInteger(seconds) ? String(remainder).padStart(2, '0') : remainder.toFixed(1).padStart(4, '0');
  return `${Math.floor(seconds / 60)}:${digits}`;
};

function Lesson({ clip }: { clip: Clip }) {
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState(0);
  const source = catalog.sources.find(s => s.id === clip.sourceId)!;
  const start = Math.floor(clip.startSeconds);
  const end = Math.ceil(clip.endSeconds);
  return (
    <article className="card tai-lesson">
      <h3>{clip.title}</h3>
      <p>{clip.context}</p>
      <p className="small">戴資穎：{clip.playerAppearance} · {clip.courtSide} · {clip.playback}</p>
      <div className="tai-video">
        {playing ? <iframe
          key={replay}
          title={`${catalog.player} — ${clip.title}`}
          src={`https://www.youtube-nocookie.com/embed/${source.videoId}?start=${start}&end=${end}&autoplay=1&rel=0`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        /> : <div className="tai-video-prompt">
          <span>BWF TV 官方影片</span>
          <strong>{time(clip.startSeconds)}–{time(clip.endSeconds)}</strong>
          <button className="btn primary" onClick={() => setPlaying(true)}>載入呢段影片</button>
          <span className="small">按下先連接 YouTube</span>
        </div>}
      </div>
      <div className="tai-actions">
        {playing && <button className="btn" onClick={() => setReplay(n => n + 1)}>由片段開頭重播</button>}
        <a className="btn" href={`${source.url}&t=${start}s`} target="_blank" rel="noreferrer">喺 YouTube 睇原片 ↗</a>
      </div>
      <p className="small">重點約 {time(clip.eventSeconds)}（{clip.eventLabel}）。時間係人工抽幀估計，唔係逐幀擊球標註。可用 YouTube 播放器調慢速度；嵌入播唔到可開原片。</p>
      <h4>跟住畫面觀察</h4>
      <ol>{clip.observations.map(note => <li key={note}>{note}</li>)}</ol>
      <h4>呢段嘅限制</h4>
      <ul>{clip.limitations.map(note => <li key={note}>{note}</li>)}</ul>
      <p className="small">來源：{source.publisher} · {source.title} · 畫面核對：{catalog.updatedAt}</p>
    </article>
  );
}

export default function TaiPlayerStudy({ moveId, onMoveChange }: { moveId: string; onMoveChange: (id: string) => void }) {
  const entry = catalog.moves.find(move => move.moveId === moveId)!;
  const clips = catalog.clips.filter(clip => clip.moveId === moveId);
  const covered = new Set(catalog.clips.map(clip => clip.moveId)).size;
  return (
    <section className="tai-study" aria-label="戴資穎真人動作片段庫">
      <div className="card tai-intro">
        <h3>戴資穎 · 16 種動作</h3>
        <p><b>{covered} / {MOVES.length} 種已有畫面核對片段</b>；其餘保留待補位置。先揀動作，再睇原片同觀察筆記。</p>
        <p className="small">呢度係真人影片學習，唔係戴資穎嘅 3D 動捕。分類同時間由人工查看抽幀畫面整理，未經教練覆核；唔提供精確關節角度或姿勢評分。</p>
      </div>
      <div className="tai-picker" aria-label="選擇動作">
        {CATEGORIES.map(category => <div key={category} className="tai-category">
          <h4>{category}</h4>
          <div className="tai-moves">{MOVES.filter(move => move.category === category).map(move => {
            const available = catalog.clips.some(clip => clip.moveId === move.id);
            return <button key={move.id} aria-pressed={move.id === moveId} onClick={() => onMoveChange(move.id)}>
              <span>{move.name}</span><small className={available ? 'tai-found' : ''}>{available ? '有片段' : '待補'}</small>
            </button>;
          })}</div>
        </div>)}
      </div>
      <h3>{entry.label}</h3>
      {clips.length ? clips.map(clip => <Lesson key={clip.id} clip={clip} />) : <div className="card tai-pending" role="status">
        <h4>仲未有符合條件嘅戴資穎片段</h4>
        <p>{entry.reviewRequirement}</p>
        <p className="small">以下係待查來源，唔代表已經搵到呢個動作：</p>
        <ul>{entry.searchSourceIds.map(id => {
          const source = catalog.sources.find(s => s.id === id)!;
          return <li key={id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>;
        })}</ul>
      </div>}
    </section>
  );
}
