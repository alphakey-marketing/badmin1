/**
 * Checks every demo move against its reference ranges (joint angles, lunge depth, serve height…)
 * and that every planted foot is reachable. Run: npm run check:moves
 */
import { MOVES } from '../src/demo/moves';
import { measure, poseAt } from '../src/demo/rig';

let failures = 0;
for (const m of MOVES) {
  const out: string[] = [];
  for (const s of m.steps) {
    for (const c of s.checks ?? []) {
      const v = measure(poseAt(m.keys, s.t + 0.0005))[c.metric];
      const ok = v >= c.min && v <= c.max;
      if (!ok) failures++;
      const shown = c.unit === 'cm' ? `${(v * 100).toFixed(0)} cm` : v.toFixed(c.unit === '°' ? 0 : 2);
      out.push(`  ${ok ? 'ok ' : 'BAD'} [${s.title}] ${c.label} = ${shown} (${c.min}–${c.max})`);
    }
  }
  let worst = 0;
  let at = 0;
  for (let t = 0; t <= m.duration; t += 0.01) {
    const me = measure(poseAt(m.keys, t));
    const miss = Math.max(me.footMissL, me.footMissR);
    if (miss > worst) {
      worst = miss;
      at = t;
    }
  }
  if (worst > 0.02) {
    failures++;
    out.push(`  BAD foot cannot reach its target: ${(worst * 100).toFixed(0)} cm at t=${at.toFixed(2)} s`);
  }
  console.log(`${m.id} (${m.name})\n${out.join('\n')}`);
}
console.log(failures ? `\n${failures} problem(s)` : '\nAll moves OK');
process.exit(failures ? 1 : 0);
