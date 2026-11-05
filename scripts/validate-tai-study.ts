import assert from 'node:assert/strict';
import catalog from '../docs/tai-tzu-ying/catalog.json';
import { MOVES } from '../src/demo/moves';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TaiPlayerStudy from '../src/demo/TaiPlayerStudy';

const moveIds = new Set(MOVES.map(move => move.id));
assert.equal(moveIds.size, 16);
assert.deepEqual(new Set(catalog.moves.map(move => move.moveId)), moveIds, 'Cover every app move');
assert.equal(catalog.moves.length, moveIds.size, 'No duplicate moves');
const sources = new Map(catalog.sources.map(source => [source.id, source]));
assert.equal(sources.size, catalog.sources.length);
for (const source of catalog.sources) {
  assert.match(source.videoId, /^[\w-]{11}$/);
  assert.equal(source.url, `https://www.youtube.com/watch?v=${source.videoId}`);
}
const clipIds = new Set<string>();
for (const clip of catalog.clips) {
  assert(!clipIds.has(clip.id), `Duplicate clip ${clip.id}`);
  clipIds.add(clip.id);
  assert(moveIds.has(clip.moveId), `Unknown move ${clip.moveId}`);
  assert(sources.has(clip.sourceId), `Unknown source ${clip.sourceId}`);
  assert.equal(sources.get(clip.sourceId)!.verificationStatus, 'frames_reviewed');
  assert(clip.startSeconds >= 0 && clip.startSeconds < clip.eventSeconds && clip.eventSeconds < clip.endSeconds);
  assert(Math.floor(clip.startSeconds) < Math.ceil(clip.endSeconds));
  assert(clip.observations.length > 0 && clip.limitations.length > 0);
  assert(clip.courtSide && clip.playerAppearance && clip.playback && clip.context);
  assert.equal(clip.reviewStatus, 'frames_reviewed');
}
for (const move of catalog.moves) {
  const hasClip = catalog.clips.some(clip => clip.moveId === move.moveId);
  assert.equal(move.status, hasClip ? 'frames_reviewed' : 'needs_visual_review');
  assert(move.reviewRequirement && move.searchSourceIds.length > 0);
  move.searchSourceIds.forEach(id => assert(sources.has(id), `Unknown candidate source ${id}`));
  const html = renderToStaticMarkup(createElement(TaiPlayerStudy, { moveId: move.moveId, onMoveChange: () => {} }));
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 16, 'Render every move selector');
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1, 'Exactly one selected move');
  assert(!html.includes('<iframe'), 'No external player before user loads video');
  assert.equal(html.includes('載入呢段影片'), hasClip, 'Only reviewed clips get a player');
  assert.equal(html.includes('role="status"'), !hasClip, 'Missing evidence gets explicit pending state');
  if (hasClip) {
    assert(html.includes('喺 YouTube 睇原片'), 'Keep original video fallback');
    assert(html.includes('呢段嘅限制'), 'Show evidence limits');
  } else {
    assert(html.includes(move.reviewRequirement), 'Explain the missing evidence');
  }
}
const covered = new Set(catalog.clips.map(clip => clip.moveId)).size;
assert.equal(catalog.verification.reviewedMoveCount, covered);
assert.equal(catalog.verification.reviewedClipCount, catalog.clips.length);
console.log(`Tai study OK: ${catalog.moves.length} moves rendered, ${covered} covered, ${catalog.clips.length} reviewed clips; pending states and lazy player verified`);
