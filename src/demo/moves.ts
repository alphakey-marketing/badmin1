/**
 * Demo moves for a right-handed player (mirrored in the viewer for left-handers).
 * Base position is the origin; the net is at x ≈ +3.3; +z is the player's right.
 *
 * Poses are set by joint angles (fitHeight / hand helpers), then checked against reference ranges
 * (each step's `checks`). Reference ranges come from src/data/badmintonReferenceAngles.ts (published
 * biomechanics) where available; ranges marked "coaching" are standard coaching guidance, not lab data.
 *
 * Rules quoted: BWF Laws of Badminton 9.1 — the whole shuttle must be below 1.15 m from the floor at the
 * instant it is hit by the server's racket; both feet in contact with the floor until the serve is made.
 */
import { fitHeight, hand, racket, type Foot, type Key, type Measure, type Pose, type Vec } from './rig';

export type Part = 'legs' | 'hips' | 'trunk' | 'shoulder' | 'elbow' | 'wrist' | 'none';
export type Muscle =
  | 'quads' | 'glutes' | 'calves' | 'hamstrings' | 'core' | 'chest' | 'deltoid' | 'triceps' | 'forearm' | 'fingers';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  quads: '股四頭肌',
  glutes: '臀肌',
  calves: '小腿肌',
  hamstrings: '膕繩肌',
  core: '腹斜肌／核心',
  chest: '胸大肌',
  deltoid: '三角肌',
  triceps: '肱三頭肌',
  forearm: '前臂（旋前／旋後肌）',
  fingers: '手指屈肌（握拍）',
};

export interface Check {
  label: string;
  metric: keyof Measure;
  min: number;
  max: number;
  unit: '°' | 'cm' | 'm' | '×';
  /** Where the range comes from. */
  ref: string;
}

export interface Step {
  t: number;
  title: string;
  cue: string;
  focus: Part;
  muscles?: Muscle[];
  checks?: Check[];
}

export type Category = '步法' | '後場' | '中場' | '前場' | '發球';

export interface Move {
  id: string;
  name: string;
  category: Category;
  summary: string;
  duration: number;
  keys: Key[];
  steps: Step[];
  contactT?: number;
  shuttleIn?: Vec; // direction the shuttle travels before contact
  shuttleOut?: Vec; // direction it leaves
}

const foot = (x: number, z: number, yaw = 0, lift = 0): Foot => ({ x, z, yaw, lift });

const READY_HAND_R = hand('R', [0.8, -0.45, 0.35], 100);
const READY: Pose = fitHeight(
  {
    x: 0, z: 0, h: 0.85, yaw: 0, twist: 0, lean: 15,
    footL: foot(0.08, -0.3, -12), footR: foot(-0.08, 0.3, 12),
    handR: READY_HAND_R, headR: racket(READY_HAND_R, [0.35, 1, 0.25]), faceR: [1, 0, 0],
    handL: hand('L', [0.8, -0.6, -0.3], 110),
    elbowR: [-0.2, -1, 0.8], elbowL: [-0.2, -1, -0.8],
  },
  'R',
  142,
);

/** Build a pose from READY, then set the pelvis height from one leg's knee angle. */
function P(over: Partial<Pose>, leg?: ['R' | 'L', number]): Pose {
  const p = { ...READY, ...over };
  return leg ? fitHeight(p, leg[0], leg[1]) : p;
}
/** Arm + racket in one go. */
function arm(dir: Vec, elbow: number, rdir: Vec, face: Vec = [1, 0, 0], elbowHint?: Vec): Partial<Pose> {
  const h = hand('R', dir, elbow);
  return { handR: h, headR: racket(h, rdir), faceR: face, ...(elbowHint ? { elbowR: elbowHint } : {}) };
}

// --- Reference ranges ----------------------------------------------------------
const C = {
  readyKnee: (m: keyof Measure = 'kneeR'): Check => ({ label: '膝頭微屈', metric: m, min: 130, max: 165, unit: '°', ref: '教練建議' }),
  readyStance: { label: '雙腳闊度（肩寬倍數）', metric: 'stance', min: 1.1, max: 1.9, unit: '×', ref: '教練建議：比肩略闊' } as Check,
  loadKnee: (min: number, max: number, ref: string): Check => ({ label: '後腳膝頭（蓄力）', metric: 'kneeR', min, max, unit: '°', ref }),
  backElbow: { label: '引拍手肘', metric: 'elbowR', min: 70, max: 100, unit: '°', ref: '殺球研究：引拍約 80°' } as Check,
  lungeKnee: { label: '前腳膝頭（弓步）', metric: 'kneeR', min: 85, max: 120, unit: '°', ref: '網前弓步研究：約 90–110°' } as Check,
  kneeToe: { label: '膝頭超過腳尖', metric: 'kneePastToeR', min: -0.3, max: 0.06, unit: 'cm', ref: '教練建議：唔超過腳尖' } as Check,
  rearLeg: { label: '後腳伸直撐住', metric: 'kneeL', min: 130, max: 180, unit: '°', ref: '教練建議' } as Check,
  upright: { label: '上身前傾', metric: 'lean', min: 0, max: 35, unit: '°', ref: '教練建議：挺胸，唔好彎腰撲' } as Check,
  serveHeight: { label: '擊球點高度（拍頭）', metric: 'racketHeadY', min: 0.3, max: 1.15, unit: 'm', ref: 'BWF 規則 9.1.6：發球時成個球低過 1.15 m' } as Check,
};

// ---------------------------------------------------------------------------
// Footwork
// ---------------------------------------------------------------------------

const SPLIT_LAND = P({ lean: 17, footL: foot(0.08, -0.34, -15), footR: foot(-0.08, 0.34, 15) }, ['R', 128]);

const SPLIT: Move = {
  id: 'split',
  name: '準備姿勢＋分腿跳',
  category: '步法',
  summary: '對手擊球前一刻做一個細細嘅分腿跳，落地時雙腳比肩闊、前腳掌著地，即刻可以向任何方向起動。',
  duration: 1.8,
  keys: [
    { t: 0, pose: READY },
    { t: 0.45, pose: P({ lean: 13 }, ['R', 150]) },
    { t: 0.6, pose: P({ lean: 11, footL: foot(0.06, -0.24, -10, 0.05), footR: foot(-0.06, 0.24, 10, 0.05) }, ['R', 160]) },
    { t: 0.75, pose: SPLIT_LAND },
    { t: 1.1, pose: SPLIT_LAND },
    { t: 1.8, pose: READY },
  ],
  steps: [
    { t: 0, title: '準備', cue: '微微屈膝，重心喺中間，上身微微前傾，拍頭舉起放喺身前。', focus: 'legs', muscles: ['quads', 'calves'], checks: [C.readyKnee(), C.readyStance] },
    { t: 0.45, title: '起跳時機', cue: '對手準備擊球嗰下，輕輕彈起（細跳，唔係大跳）。', focus: 'legs', muscles: ['calves'] },
    { t: 0.75, title: '分腿落地', cue: '前腳掌著地，雙腳比肩膊闊，膝頭屈，好似彈簧咁準備起動。', focus: 'legs', muscles: ['quads', 'glutes', 'calves'], checks: [{ ...C.readyKnee(), min: 110, max: 150, label: '落地屈膝' }] },
    { t: 1.1, title: '起動', cue: '睇清楚來球方向，用離目標較遠嗰隻腳蹬地起步。', focus: 'hips', muscles: ['glutes', 'calves'] },
  ],
};

// ---------------------------------------------------------------------------
// Rear court: forehand overhead (clear / smash / drop / slice)
// ---------------------------------------------------------------------------

type OverKind = 'clear' | 'smash' | 'drop' | 'slice';

const OVER = {
  clear: { name: '後場正手高遠球', elbow: 165, dir: [0.1, 1, 0.12] as Vec, rdir: [0.12, 1, 0] as Vec, face: [0.7, 0.7, 0] as Vec, lean: 2, jump: 0.05, out: [1, 0.6, -0.05] as Vec, knee: [110, 145, '高遠球參考：110–145°'] as const, cElbow: [155, 180, '高遠球研究：擊球時手臂接近伸直'] as const },
  smash: { name: '後場正手（跳）殺球', elbow: 150, dir: [0.45, 1, 0.12] as Vec, rdir: [0.65, 0.75, 0] as Vec, face: [1, -0.3, 0] as Vec, lean: 10, jump: 0.12, out: [1, -0.22, -0.05] as Vec, knee: [100, 130, '殺球研究：蓄力約 110°'] as const, cElbow: [140, 165, '殺球研究：擊球約 148°'] as const },
  drop: { name: '後場正手吊球', elbow: 145, dir: [0.35, 1, 0.12] as Vec, rdir: [0.5, 0.85, 0] as Vec, face: [0.95, 0.25, 0] as Vec, lean: 4, jump: 0.04, out: [1, 0.05, -0.05] as Vec, knee: [110, 145, '吊球參考：110–145°'] as const, cElbow: [130, 160, '吊球研究：比殺球略屈'] as const },
  slice: { name: '後場劈吊（切球）', elbow: 148, dir: [0.4, 1, 0.12] as Vec, rdir: [0.6, 0.78, -0.1] as Vec, face: [1, -0.05, 0.3] as Vec, lean: 6, jump: 0.04, out: [1, -0.05, -0.3] as Vec, knee: [100, 140, '殺／吊參考'] as const, cElbow: [135, 165, '同殺球相近'] as const },
};

function overhead(kind: OverKind): Move {
  const o = OVER[kind];
  const CT = 1.7;
  const contactArm = arm(o.dir, o.elbow, o.rdir, o.face, [-0.2, 0.3, 1]);
  const keys: Key[] = [
    { t: 0, pose: READY },
    { t: 0.25, pose: SPLIT_LAND },
    {
      t: 0.55,
      pose: P({
        x: -0.35, z: 0.2, yaw: 60, twist: 8, lean: 6,
        footL: foot(0.05, -0.2, 20), footR: foot(-0.75, 0.55, 80),
        ...arm([-0.2, 0.55, 0.8], 95, [-0.15, 1, 0.1], [0, 0, 1], [-0.3, 0.2, 1]),
        handL: hand('L', [0.6, 0.5, -0.3], 150), elbowL: [0.2, -0.5, -1],
      }, ['R', 140]),
    },
    {
      t: 0.8,
      pose: P({
        x: -0.95, z: 0.5, yaw: 75, twist: 6, lean: 3,
        footL: foot(-0.55, 0.32, 40, 0.05), footR: foot(-0.75, 0.55, 80),
        ...arm([-0.25, 0.6, 0.8], 90, [-0.2, 1, 0.1], [0, 0, 1], [-0.3, 0.3, 1]),
        handL: hand('L', [0.55, 0.65, -0.25], 155), elbowL: [0.2, -0.3, -1],
      }, ['R', 145]),
    },
    {
      t: 1.05,
      pose: P({
        x: -1.6, z: 0.8, yaw: 82, twist: 5, lean: 1,
        footL: foot(-1.1, 0.5, 50), footR: foot(-2.0, 1.1, 85, 0.04),
        ...arm([-0.3, 0.6, 0.8], 88, [-0.4, 0.6, 0.2], [0, 0, 1], [-0.4, 0.5, 1]),
        handL: hand('L', [0.5, 0.75, -0.2], 160), elbowL: [0.2, -0.2, -1],
      }, ['L', 145]),
    },
    // Load: weight on the back leg, left arm up at the shuttle, elbow high, racket head drops behind
    {
      t: 1.38,
      pose: P({
        x: -2.0, z: 0.98, yaw: 85, twist: 4, lean: -6,
        footL: foot(-1.65, 0.75, 50), footR: foot(-2.3, 1.15, 85),
        ...arm([-0.35, 0.55, 0.8], 82, [-0.55, -0.7, 0.25], [0, 0, 1], [-0.4, 0.6, 1]),
        handL: hand('L', [0.5, 0.85, -0.2], 165), elbowL: [0.2, 0, -1],
      }, ['R', 117]),
    },
    // Drive: push off the back leg; hips turn first, chest lags (twist)
    {
      t: 1.58,
      pose: P({
        x: -1.98, z: 0.97, yaw: 50, twist: 24, lean: -3,
        footL: foot(-1.65, 0.75, 50), footR: foot(-2.3, 1.15, 85),
        ...arm([-0.1, 0.85, 0.6], 105, [-0.6, 0.25, 0.4], [0, 0, 1], [-0.2, 0.8, 1]),
        handL: hand('L', [0.5, 0.3, -0.35], 140), elbowL: [0, -0.6, -1],
      }, ['R', 140]),
    },
    // Contact
    {
      t: CT,
      pose: P({
        x: -1.95, z: 0.95, yaw: 22, twist: -6, lean: o.lean,
        footL: foot(-1.6, 0.72, 30, o.jump), footR: foot(-2.25, 1.12, 60, o.jump + 0.05),
        ...contactArm,
        handL: hand('L', [0.7, -0.4, -0.1], 90), elbowL: [0, -1, -0.5],
      }, ['L', 168]),
    },
    // Follow-through + scissor kick (legs swap in the air: right forward, left back)
    {
      t: 1.95,
      pose: P({
        x: -1.75, z: 0.88, yaw: -8, twist: -15, lean: 14,
        footL: foot(-2.12, 0.8, 20), footR: foot(-1.45, 1.0, 10),
        ...arm([0.7, -0.5, -0.5], 120, [0.45, -0.7, -0.5], [0, -0.3, -1], [0, -1, 0.5]),
        handL: hand('L', [0.2, -0.8, -0.5], 120),
      }, ['R', 135]),
    },
    {
      t: 2.45,
      pose: P({
        x: -0.9, z: 0.45, yaw: 15, lean: 13,
        footL: foot(-1.05, 0.15, -5, 0.04), footR: foot(-0.75, 0.75, 15),
      }, ['R', 140]),
    },
    { t: 3.0, pose: READY },
    { t: 3.4, pose: READY },
  ];

  const summaries: Record<OverKind, string> = {
    clear: '分腿 → 轉身側身 → 并步後退 → 後腳蓄力 → 蹬地轉髖 → 轉肩 → 伸直手臂喺最高點擊球 → 剪刀腳 → 回中。',
    smash: '同高遠球一樣嘅步法同準備，擊球點喺身體前面啲、拍面向下壓，可以跳起擊球。',
    drop: '準備動作要同殺球、高遠球一模一樣（對手睇唔穿），觸球一刻先減速、控制拍面。',
    slice: '同殺球一樣嘅準備，觸球時拍面斜切過球頭（右手：揮拍向左前方），令球帶強烈自旋、急墜落前場。',
  };
  const contactCue: Record<OverKind, string> = {
    clear: '擊球：喺頭頂稍前嘅最高點、手臂差唔多伸直，前臂內旋帶動拍面向前上，送球去底線。',
    smash: '擊球：擊球點喺身體前上方，手肘略屈（約 150°），前臂內旋＋手指發力，拍面向下壓。',
    drop: '擊球：同樣揮拍，但觸球前減速，拍面輕推，令球剛過網就落。',
    slice: '擊球：拍面同揮拍方向有夾角，擦過球頭一側（切），唔係正面撞。',
  };
  return {
    id: kind,
    name: o.name,
    category: '後場',
    summary: summaries[kind],
    duration: 3.4,
    keys,
    contactT: CT,
    shuttleIn: [-0.2, -1, 0],
    shuttleOut: o.out,
    steps: [
      { t: 0, title: '分腿跳', cue: '對手擊球前分腿跳，睇到係後場高球。', focus: 'legs', muscles: ['calves', 'quads'] },
      { t: 0.4, title: '轉身側身', cue: '右腳向右後方踏，身體轉側（左肩向網），球拍同手肘舉高。', focus: 'hips', muscles: ['glutes', 'core'] },
      { t: 0.72, title: '并步後退', cue: '左腳靠近右腳（并步），右腳再向後踏。唔好打交叉腳。', focus: 'legs', muscles: ['quads', 'calves'] },
      {
        t: 1.2, title: '蓄力', cue: '重心落喺後腳（右腳）屈膝；左手舉高指住球；手肘抬高，拍頭落到背後。', focus: 'legs', muscles: ['quads', 'glutes', 'deltoid'],
        checks: [C.loadKnee(o.knee[0], o.knee[1], o.knee[2]), C.backElbow],
      },
      { t: 1.5, title: '蹬地轉髖', cue: '後腳蹬地，髖部先轉向網，肩膊仲未轉（拉開髖肩夾角）。', focus: 'hips', muscles: ['glutes', 'calves', 'core'] },
      { t: 1.62, title: '轉肩帶手', cue: '肩膊跟住轉，手肘向上向前帶，左手收埋落胸前。', focus: 'shoulder', muscles: ['core', 'chest', 'deltoid'] },
      {
        t: CT, title: '擊球', cue: contactCue[kind], focus: 'wrist', muscles: ['triceps', 'forearm', 'fingers'],
        checks: [
          { label: '擊球時手肘', metric: 'elbowR', min: o.cElbow[0], max: o.cElbow[1], unit: '°', ref: o.cElbow[2] },
          { label: '手臂抬高', metric: 'shoulderR', min: 140, max: 180, unit: '°', ref: '殺／高遠研究：140–180°' },
          { label: '手腕高過頭頂', metric: 'wristAboveHead', min: 0.1, max: 1, unit: 'cm', ref: '最高點擊球' },
        ],
      },
      { t: 1.85, title: '剪刀腳＋隨揮', cue: '雙腳喺空中交換：右腳向前落地，左腳向後；球拍自然隨揮到身體左下方。', focus: 'legs', muscles: ['quads', 'hamstrings', 'core'] },
      { t: 2.3, title: '回中', cue: '右腳蹬返，快速回到中間準備位置。', focus: 'legs', muscles: ['quads', 'calves'] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rear court: round-the-head and backhand
// ---------------------------------------------------------------------------

const ROUND_HEAD: Move = (() => {
  const CT = 1.5;
  return {
    id: 'aroundHead',
    name: '頭頂（繞頭）殺球',
    category: '後場',
    summary: '反手位後場高球，用正手繞過頭頂打：并步退去左後場，身體向左側傾，喺左肩上方擊球，左腳落地。',
    duration: 3.0,
    contactT: CT,
    shuttleIn: [-0.2, -1, 0],
    shuttleOut: [1, -0.2, 0.2],
    keys: [
      { t: 0, pose: READY },
      { t: 0.25, pose: SPLIT_LAND },
      {
        t: 0.55,
        pose: P({
          x: -0.5, z: -0.25, yaw: 35, twist: 5, lean: 6,
          footL: foot(-0.75, -0.55, 20), footR: foot(-0.2, -0.05, 30, 0.03),
          ...arm([-0.2, 0.6, 0.7], 92, [-0.2, 1, 0], [0, 0, 1], [-0.3, 0.4, 1]),
          handL: hand('L', [0.6, 0.5, -0.3], 150),
        }, ['L', 140]),
      },
      {
        t: 0.85,
        pose: P({
          x: -1.3, z: -0.6, yaw: 40, twist: 5, lean: 2,
          footL: foot(-1.55, -0.95, 25), footR: foot(-0.95, -0.45, 40, 0.04),
          ...arm([-0.3, 0.6, 0.7], 85, [-0.5, -0.5, 0.2], [0, 0, 1], [-0.4, 0.6, 1]),
          handL: hand('L', [0.5, 0.8, -0.3], 160),
        }, ['L', 125]),
      },
      {
        t: 1.25,
        pose: P({
          x: -1.85, z: -0.9, yaw: 45, twist: 8, lean: -4, side: -8,
          footL: foot(-2.05, -1.2, 25), footR: foot(-1.6, -0.55, 50),
          ...arm([-0.35, 0.6, 0.7], 82, [-0.55, -0.6, 0.2], [0, 0, 1], [-0.4, 0.7, 1]),
          handL: hand('L', [0.5, 0.85, -0.25], 165),
        }, ['R', 118]),
      },
      {
        t: CT,
        pose: P({
          x: -1.8, z: -0.95, yaw: 15, twist: -5, lean: 6, side: -20,
          footL: foot(-2.05, -1.2, 25, 0.04), footR: foot(-1.6, -0.55, 50, 0.08),
          ...arm([0.35, 1, -0.45], 152, [0.55, 0.8, -0.2], [1, -0.25, 0], [-0.2, 0.4, 1]),
          handL: hand('L', [0.5, -0.5, -0.3], 100),
        }, ['L', 165]),
      },
      {
        t: 1.75,
        pose: P({
          x: -1.6, z: -0.95, yaw: -5, twist: -10, lean: 14, side: -5,
          footL: foot(-1.95, -1.25, 20), footR: foot(-1.25, -0.7, 10, 0.05),
          ...arm([0.7, -0.5, -0.5], 120, [0.45, -0.7, -0.5], [0, -0.3, -1], [0, -1, 0.5]),
        }, ['L', 130]),
      },
      { t: 2.4, pose: P({ x: -0.7, z: -0.4, yaw: 10, lean: 13, footL: foot(-0.75, -0.7, -10), footR: foot(-0.55, 0.0, 15, 0.04) }, ['L', 140]) },
      { t: 3.0, pose: READY },
    ],
    steps: [
      { t: 0, title: '分腿跳', cue: '睇到係反手位後場高球。', focus: 'legs', muscles: ['calves'] },
      { t: 0.4, title: '轉身後退', cue: '身體微轉，左腳向左後方退，用并步去到球後面。', focus: 'legs', muscles: ['quads', 'glutes'] },
      { t: 1.1, title: '蓄力', cue: '重心喺後腳，手肘抬高，左手指球。', focus: 'legs', muscles: ['quads', 'glutes'], checks: [C.loadKnee(100, 135, '殺球參考'), C.backElbow] },
      { t: CT, title: '繞頭擊球', cue: '上身向左側傾，手臂繞過頭頂，喺左肩上方擊球，前臂內旋。', focus: 'trunk', muscles: ['core', 'deltoid', 'triceps', 'forearm'], checks: [{ label: '擊球時手肘', metric: 'elbowR', min: 140, max: 170, unit: '°', ref: '同殺球相近（推算）' }] },
      { t: 1.7, title: '落地', cue: '左腳落地撐住，右腳順勢向前。', focus: 'legs', muscles: ['quads', 'hamstrings'] },
      { t: 2.3, title: '回中', cue: '左腳蹬地，盡快回中。', focus: 'legs', muscles: ['quads', 'calves'] },
    ],
  };
})();

const BACKHAND_CLEAR: Move = (() => {
  const CT = 1.35;
  return {
    id: 'backhandClear',
    name: '反手後場高遠球',
    category: '後場',
    summary: '反手位後場來不及繞頭時用：轉身背向網，右腳跨入左後場角，手肘領先向上，前臂外旋（反手）擊球，再轉身回中。',
    duration: 2.9,
    contactT: CT,
    shuttleIn: [-0.25, -1, 0],
    shuttleOut: [1, 0.55, 0.1],
    keys: [
      { t: 0, pose: READY },
      { t: 0.25, pose: SPLIT_LAND },
      {
        t: 0.55,
        pose: P({
          x: -0.45, z: -0.35, yaw: -100, twist: -5, lean: 10,
          footL: foot(-0.35, -0.6, -90), footR: foot(-0.1, -0.1, -60, 0.05),
          ...arm([0.9, 0.0, -0.4], 80, [0.1, -0.5, -0.8], [1, 0, 0], [0.5, 0.2, 1]),
          handL: hand('L', [0.3, -0.6, -0.4], 140),
        }, ['L', 140]),
      },
      {
        t: 0.95,
        pose: P({
          x: -1.35, z: -0.85, yaw: -140, twist: -5, lean: 8,
          footL: foot(-1.0, -0.72, -110), footR: foot(-1.85, -1.15, -150),
          ...arm([0.85, 0.25, -0.45], 75, [0.0, -0.8, -0.5], [1, 0, 0], [0.4, 0.6, 1]),
          handL: hand('L', [-0.3, -0.6, -0.4], 150),
        }, ['R', 118]),
      },
      {
        t: CT,
        pose: P({
          x: -1.42, z: -0.88, yaw: -150, twist: 10, lean: 4,
          footL: foot(-1.0, -0.72, -110), footR: foot(-1.85, -1.15, -150),
          ...arm([-0.15, 1, 0.35], 155, [-0.3, 0.9, 0.25], [-0.8, 0.55, 0], [0.4, 0.7, 1]),
          handL: hand('L', [-0.3, -0.6, -0.4], 150),
        }, ['R', 122]),
      },
      {
        t: 1.7,
        pose: P({
          x: -1.3, z: -0.8, yaw: -120, twist: 10, lean: 8,
          footL: foot(-1.0, -0.72, -110), footR: foot(-1.85, -1.15, -150),
          ...arm([0.2, 0.3, 0.9], 140, [-0.2, 0.2, 0.9], [-0.5, 0.5, 0.3]),
        }, ['R', 130]),
      },
      { t: 2.2, pose: P({ x: -0.6, z: -0.4, yaw: -40, lean: 12, footL: foot(-0.7, -0.6, -40), footR: foot(-0.3, -0.05, -10, 0.04) }, ['L', 140]) },
      { t: 2.9, pose: READY },
    ],
    steps: [
      { t: 0, title: '分腿跳', cue: '睇到係反手位後場球，而且繞頭嚟唔切。', focus: 'legs', muscles: ['calves'] },
      { t: 0.4, title: '轉身背網', cue: '以左腳為軸向左後轉身，背部對網，換反手握拍（拇指頂住拍柄）。', focus: 'hips', muscles: ['glutes', 'core', 'fingers'] },
      { t: 0.96, title: '右腳跨步', cue: '右腳跨入左後場角，屈膝承重；手肘抬高指向來球。', focus: 'legs', muscles: ['quads', 'glutes'], checks: [{ ...C.lungeKnee, min: 100, max: 135, label: '跨步腳膝頭', ref: '推算：同後場弓步相近' }] },
      { t: CT, title: '反手擊球', cue: '手肘領先向上，前臂外旋、拇指發力，喺右肩上方擊球；身體保持穩定。', focus: 'wrist', muscles: ['deltoid', 'triceps', 'forearm', 'fingers'], checks: [{ label: '擊球時手肘', metric: 'elbowR', min: 140, max: 175, unit: '°', ref: '教練建議：接近伸直' }] },
      { t: 1.65, title: '回身', cue: '右腳蹬地，轉返面向網，回中。', focus: 'legs', muscles: ['quads', 'calves'] },
    ],
  };
})();

// ---------------------------------------------------------------------------
// Mid court: drives and defence
// ---------------------------------------------------------------------------

function drive(backhand: boolean): Move {
  const s = backhand ? -1 : 1;
  const CT = 0.88;
  const R: Foot = backhand ? foot(0.35, -0.6, -40) : foot(-0.05, 0.75, 55);
  const L: Foot = backhand ? foot(-0.1, -0.15, -20) : foot(0.05, -0.2, 5);
  const base = { x: 0.05, z: 0.3 * s, yaw: 35 * s, lean: 10, footL: L, footR: R };
  const prep = backhand
    ? arm([0.6, 0.15, -0.8], 90, [-0.25, 0.5, -0.6], [1, 0, 0], [0.6, 0.3, 1])
    : arm([-0.2, 0.05, 1], 95, [-0.5, 0.55, 0.55], [1, 0, 0], [-0.2, -0.3, 1]);
  const hit = backhand
    ? arm([0.85, 0.05, -0.45], 140, [0.75, 0.25, -0.25], [1, 0, 0], [0.4, 0.2, 1])
    : arm([0.6, 0.02, 0.75], 135, [0.8, 0.2, 0.35], [1, 0, 0], [-0.2, -0.3, 1]);
  const follow = backhand
    ? arm([0.8, 0.1, 0.35], 130, [0.5, 0.35, 0.7])
    : arm([0.8, 0.0, -0.15], 110, [0.5, 0.45, -0.7]);
  return {
    id: backhand ? 'backhandDrive' : 'forehandDrive',
    name: backhand ? '反手平抽' : '正手平抽',
    category: '中場',
    summary: backhand
      ? '中場反手位平飛球：右腳向左前踏，手肘喺身前抬起，用拇指推、前臂短促外旋，平平抽返過網。'
      : '中場正手位平飛球：右腳向右踏，球拍收喺身側（手肘屈），喺肩膊高度身前擊球，動作細而快。',
    duration: 2.0,
    contactT: CT,
    shuttleIn: [-1, -0.04, 0.15 * s],
    shuttleOut: [1, 0.05, 0],
    keys: [
      { t: 0, pose: READY },
      { t: 0.25, pose: SPLIT_LAND },
      { t: 0.68, pose: P({ ...base, ...prep }, ['R', 128]) },
      { t: CT, pose: P({ ...base, yaw: 25 * s, ...hit }, ['R', 128]) },
      { t: 1.2, pose: P({ ...base, yaw: 15 * s, ...follow }, ['R', 132]) },
      { t: 1.6, pose: READY },
      { t: 2.0, pose: READY },
    ],
    steps: [
      { t: 0, title: '分腿跳', cue: '睇到平飛球。', focus: 'legs', muscles: ['calves'] },
      { t: 0.66, title: backhand ? '右腳踏左前' : '右腳踏右側', cue: backhand ? '右腳向左前方踏，重心落右腳，拍收喺身前（手肘抬起）。' : '右腳向右邊踏，重心落右腳，球拍收喺身側、手肘屈。', focus: 'legs', muscles: ['quads', 'glutes'], checks: [{ label: '承重膝頭', metric: 'kneeR', min: 110, max: 150, unit: '°', ref: '教練建議' }] },
      { t: CT, title: '擊球', cue: backhand ? '拇指頂拍柄，前臂短促外旋推出，擊球點喺身前。' : '喺肩膊高度身前擊球，前臂內旋，短促發力，唔好大揮拍。', focus: 'wrist', muscles: ['forearm', 'fingers', 'triceps'], checks: [{ label: '擊球時手肘', metric: 'elbowR', min: 115, max: 155, unit: '°', ref: '教練建議：手肘微屈' }, { label: '拍頭高度', metric: 'racketHeadY', min: 1.1, max: 1.9, unit: 'm', ref: '教練建議：大約肩膊高度' }] },
      { t: 1.2, title: '收拍回中', cue: '短隨揮即刻收拍，準備下一球。', focus: 'legs', muscles: ['quads'] },
    ],
  };
}

const BLOCK: Move = (() => {
  const CT = 0.85;
  const base = { lean: 18, footL: foot(0.12, -0.4, -15), footR: foot(-0.12, 0.4, 15) };
  return {
    id: 'block',
    name: '接殺擋網（反手防守）',
    category: '中場',
    summary: '對方殺球時：重心壓低、雙腳闊，球拍放喺身前（反手位最常用），放鬆握拍，借對方來球嘅力短擋過網。',
    duration: 1.9,
    contactT: CT,
    shuttleIn: [-1, -0.27, -0.05],
    shuttleOut: [1, 0.35, 0],
    keys: [
      { t: 0, pose: READY },
      { t: 0.3, pose: P({ ...base, ...arm([0.85, -0.35, -0.35], 105, [0.6, 0.5, -0.35], [1, 0.2, 0], [0.4, -0.3, 1]) }, ['R', 118]) },
      { t: 0.6, pose: P({ ...base, ...arm([0.9, -0.35, -0.3], 110, [0.6, 0.45, -0.3], [1, 0.3, 0], [0.4, -0.3, 1]) }, ['R', 118]) },
      { t: CT, pose: P({ ...base, ...arm([0.95, -0.3, -0.25], 128, [0.7, 0.4, -0.25], [1, 0.4, 0], [0.4, -0.3, 1]) }, ['R', 118]) },
      { t: 1.2, pose: P({ ...base, ...arm([0.9, -0.3, -0.25], 120, [0.6, 0.5, -0.25], [1, 0.3, 0], [0.4, -0.3, 1]) }, ['R', 122]) },
      { t: 1.9, pose: READY },
    ],
    steps: [
      { t: 0, title: '預判', cue: '見到對方準備殺球，重心即刻壓低。', focus: 'legs', muscles: ['quads', 'glutes'] },
      { t: 0.3, title: '防守姿勢', cue: '雙腳比肩闊、膝頭屈、上身微前傾；球拍放喺身前，拍頭略高過手腕。', focus: 'legs', muscles: ['quads', 'glutes'], checks: [{ label: '膝頭屈曲', metric: 'kneeR', min: 105, max: 140, unit: '°', ref: '教練建議：重心低' }, { label: '雙腳闊度', metric: 'stance', min: 1.6, max: 2.6, unit: '×', ref: '教練建議：比肩闊' }] },
      { t: CT, title: '擋', cue: '握拍放鬆，拍面迎住來球輕推（唔揮拍），借力令球剛過網。', focus: 'wrist', muscles: ['fingers', 'forearm'] },
      { t: 1.2, title: '準備', cue: '即刻收返拍，準備下一拍。', focus: 'legs', muscles: ['quads'] },
    ],
  };
})();

// ---------------------------------------------------------------------------
// Front court: net shots, net kill, lift
// ---------------------------------------------------------------------------

type NetKind = 'net' | 'backhandNet' | 'lift' | 'netKill';

function lungePose(s: 1 | -1, armPart: Partial<Pose>, knee = 100): Pose {
  // Front (racket) foot far forward, knee over the ankle; rear leg long.
  const front = foot(1.85, 0.95 * s, 35 * s);
  const rear = foot(1.02, 0.34 * s, 20 * s);
  const ux = front.x - rear.x;
  const uz = front.z - rear.z;
  const ul = Math.hypot(ux, uz);
  return P({
    x: front.x - (ux / ul) * 0.42, z: front.z - (uz / ul) * 0.42, yaw: 35 * s, lean: 14,
    footL: rear, footR: front, ...armPart,
    handL: hand('L', [-0.6, -0.3, -0.7], 150),
  }, ['R', knee]);
}

function netMove(kind: NetKind): Move {
  const s: 1 | -1 = kind === 'backhandNet' ? -1 : 1;
  const CT = 1.3;
  const reach: Partial<Pose> =
    kind === 'backhandNet'
      ? arm([0.9, 0.1, -0.4], 140, [0.6, 0.8, -0.15], [0.6, 0.8, 0], [0.4, 0.3, 1])
      : kind === 'lift'
        ? arm([0.9, -0.35, 0.35], 140, [0.85, -0.2, 0.3], [0.5, 0.85, 0], [-0.3, -0.6, 1])
        : arm([0.9, 0.1, 0.3], 140, [0.55, 0.8, 0.15], [0.6, 0.8, 0], [-0.3, -0.6, 1]);
  const hit: Partial<Pose> =
    kind === 'backhandNet'
      ? arm([0.92, 0.12, -0.38], 145, [0.65, 0.75, -0.1], [0.5, 0.85, 0], [0.4, 0.3, 1])
      : kind === 'lift'
        ? arm([0.9, -0.25, 0.3], 145, [0.8, 0.1, 0.2], [0.35, 0.95, 0], [-0.3, -0.6, 1])
        : arm([0.92, 0.12, 0.28], 145, [0.6, 0.75, 0.1], [0.5, 0.85, 0], [-0.3, -0.6, 1]);
  const follow: Partial<Pose> =
    kind === 'lift' ? arm([0.7, 0.6, 0.1], 135, [0.4, 1, -0.1], [0.3, 0.6, -0.6]) : hit;

  if (kind === 'netKill') {
    const killBase = { x: 0.95, z: 0.2, yaw: 15, lean: 12, footL: foot(0.6, -0.15, 0), footR: foot(1.4, 0.4, 15) };
    return {
      id: 'netKill',
      name: '網前撲球',
      category: '前場',
      summary: '對方網前球太高：快步上前，拍頭一早舉高，喺網頂上方短促向下彈擊，唔好大揮拍、唔好碰網。',
      duration: 2.0,
      contactT: 0.95,
      shuttleIn: [-1, 0.1, 0],
      shuttleOut: [1, -0.6, -0.05],
      keys: [
        { t: 0, pose: READY },
        { t: 0.2, pose: SPLIT_LAND },
        { t: 0.5, pose: P({ x: 0.45, z: 0.1, yaw: 10, lean: 10, footL: foot(0.55, -0.15, 0), footR: foot(0.3, 0.35, 15, 0.08), ...arm([0.8, 0.6, 0.25], 110, [0.15, 1, 0], [1, 0, 0], [-0.3, -0.3, 1]) }, ['L', 140]) },
        { t: 0.8, pose: P({ ...killBase, ...arm([0.8, 0.65, 0.2], 120, [0.2, 1, 0], [1, -0.2, 0], [-0.3, -0.3, 1]) }, ['R', 125]) },
        { t: 0.95, pose: P({ ...killBase, ...arm([0.85, 0.5, 0.2], 140, [0.75, 0.55, 0], [1, -0.5, 0], [-0.3, -0.3, 1]) }, ['R', 122]) },
        { t: 1.2, pose: P({ ...killBase, ...arm([0.8, 0.45, 0.2], 125, [0.45, 0.9, 0], [1, 0, 0], [-0.3, -0.3, 1]) }, ['R', 125]) },
        { t: 1.6, pose: READY },
        { t: 2.0, pose: READY },
      ],
      steps: [
        { t: 0, title: '分腿跳', cue: '睇到對方網前球偏高。', focus: 'legs', muscles: ['calves'] },
        { t: 0.4, title: '快步上前', cue: '細步快速上網，拍頭一早舉高喺身前。', focus: 'legs', muscles: ['quads', 'calves'], checks: [{ label: '拍頭高度', metric: 'racketHeadY', min: 1.7, max: 2.5, unit: 'm', ref: '教練建議：高過網頂' }] },
        { t: 0.95, title: '撲', cue: '前臂同手腕短促向下彈擊，拍面向下，擊完即刻收拍，唔好碰網。', focus: 'wrist', muscles: ['forearm', 'fingers'] },
        { t: 1.3, title: '回位', cue: '後退返中場，準備對方擋返嘅球。', focus: 'legs', muscles: ['quads'] },
      ],
    };
  }

  const names = { net: '正手網前（上網弓步）', backhandNet: '反手網前（上網弓步）', lift: '正手挑球（挑後場）' } as const;
  const summaries = {
    net: '分腿 → 左腳細步 → 右腳大步弓步（腳踭先著地）→ 拍頭舉高早接球，用手指手腕搓／放網 → 前腳蹬返回中。',
    backhandNet: '去反手位網前：同樣用右腳弓步（腳尖指向左前方），反手握拍拇指頂住，拍面向上輕推或搓。',
    lift: '網前低球挑去對方後場：弓步到位，拍頭由下向上、前臂內旋發力，送球高而深。',
  } as const;
  const hitCue = {
    net: '手臂向前伸，用手指同手腕輕輕擦／推（搓球要擦過球頭底），唔使大揮拍。',
    backhandNet: '反手握拍（拇指頂住），拍面向上，輕輕推過網或者橫向擦令球翻滾。',
    lift: '拍面由下向上，前臂內旋＋手指發力，將球挑高挑深，隨揮向上。',
  } as const;
  return {
    id: kind,
    name: names[kind],
    category: '前場',
    summary: summaries[kind],
    duration: 2.8,
    contactT: CT,
    shuttleIn: [-1, -0.7, 0],
    shuttleOut: kind === 'lift' ? [1, 1.2, 0] : [1, 0.9, -0.1 * s],
    keys: [
      { t: 0, pose: READY },
      { t: 0.25, pose: SPLIT_LAND },
      {
        t: 0.5,
        pose: P({
          x: 0.35, z: 0.12 * s, yaw: 25 * s, lean: 12,
          footL: foot(0.6, -0.05 * s, 10 * s), footR: foot(-0.05, 0.35 * s, 25 * s, 0.03),
          ...arm([0.8, -0.1, 0.3 * s], 120, [0.4, 1, 0.2 * s]),
        }, ['L', 140]),
      },
      {
        t: 0.8,
        pose: P({
          x: 0.95, z: 0.38 * s, yaw: 30 * s, lean: 12,
          footL: foot(0.75, 0.2 * s, 15 * s), footR: foot(1.3, 0.65 * s, 35 * s, 0.1),
          ...reach,
        }, ['L', 145]),
      },
      { t: 1.08, pose: lungePose(s, reach) },
      { t: CT, pose: lungePose(s, hit, 98) },
      { t: 1.5, pose: lungePose(s, follow, 100) },
      {
        t: 1.85,
        pose: P({
          x: 1.05, z: 0.45 * s, yaw: 25 * s, lean: 10,
          footL: foot(0.75, 0.2 * s, 10 * s), footR: foot(1.5, 0.75 * s, 30 * s, 0.06),
        }, ['L', 140]),
      },
      { t: 2.4, pose: READY },
      { t: 2.8, pose: READY },
    ],
    steps: [
      { t: 0, title: '分腿跳', cue: '對手擊球前分腿跳，睇到係網前球。', focus: 'legs', muscles: ['calves'] },
      { t: 0.4, title: '第一步', cue: kind === 'backhandNet' ? '左腳先向左前上一細步。' : '左腳先向前上一細步，身體向右前方。', focus: 'legs', muscles: ['quads', 'calves'] },
      { t: 0.7, title: '跨步', cue: '右腳（持拍側）向前跨大步，拍頭一路舉高。', focus: 'legs', muscles: ['quads', 'glutes'] },
      {
        t: 1.0, title: '弓步落地', cue: '腳踭先著地，再到前腳掌；前腳膝頭對住腳尖方向、唔好超過腳尖；後腳伸直撐住，上身挺直。', focus: 'legs', muscles: ['quads', 'glutes', 'hamstrings'],
        checks: [C.lungeKnee, C.kneeToe, C.rearLeg, C.upright],
      },
      {
        t: CT, title: '觸球', cue: hitCue[kind], focus: 'wrist', muscles: ['forearm', 'fingers'],
        checks: [{ label: '擊球時手肘', metric: 'elbowR', min: 130, max: 155, unit: '°', ref: '網前球研究：約 139–142°' }],
      },
      { t: 1.75, title: '蹬返', cue: '前腳發力蹬返後，并步退回中間。', focus: 'legs', muscles: ['quads', 'glutes'] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Serves
// ---------------------------------------------------------------------------

const HIGH_SERVE: Move = (() => {
  const CT = 1.1;
  const base = { x: 0.1, z: 0.05, yaw: 35, lean: 6, footL: foot(0.4, -0.15, 15), footR: foot(-0.25, 0.25, 50) };
  return {
    id: 'highServe',
    name: '正手發高遠球（單打）',
    category: '發球',
    summary: '左腳在前、右腳在後側身企；左手放球，球拍由後向下再向上揮，重心由後腳移去前腳，送球又高又深。',
    duration: 2.4,
    contactT: CT,
    shuttleIn: [0, -1, 0],
    shuttleOut: [1, 1.3, 0],
    keys: [
      { t: 0, pose: P({ ...base, ...arm([-0.2, 0.3, 0.9], 120, [-0.2, 0.8, 0.5], [0, 0, 1]), handL: hand('L', [0.9, 0.1, 0.15], 150) }, ['R', 155]) },
      { t: 0.6, pose: P({ ...base, ...arm([-0.6, -0.1, 0.8], 145, [-0.7, 0.4, 0.4], [0, 0, 1]), handL: hand('L', [0.9, 0.05, 0.15], 150) }, ['R', 150]) },
      { t: CT, pose: P({ ...base, x: 0.2, yaw: 20, footR: foot(-0.18, 0.24, 50, 0.05), ...arm([0.75, -0.75, 0.3], 165, [0.7, -0.3, 0.1], [0.3, 1, 0], [-0.2, -1, 0.5]), handL: hand('L', [0.6, -0.4, -0.3], 120) }, ['L', 155]) },
      { t: 1.5, pose: P({ ...base, x: 0.25, yaw: 0, footR: foot(-0.12, 0.22, 50, 0.07), ...arm([0.5, 0.8, -0.5], 110, [0.2, 1, -0.4], [0.3, 0.6, -0.6]), handL: hand('L', [0.4, -0.6, -0.4], 120) }, ['L', 150]) },
      { t: 2.0, pose: READY },
      { t: 2.4, pose: READY },
    ],
    steps: [
      { t: 0, title: '站位', cue: '左腳在前、右腳在後側身企；左手拎住球放喺身前。發球時雙腳要接觸地面唔可以移動（規則）。', focus: 'legs', muscles: ['quads'] },
      { t: 0.5, title: '引拍', cue: '球拍向後引，重心落後腳。', focus: 'shoulder', muscles: ['deltoid', 'core'] },
      { t: CT, title: '擊球', cue: '放球後，球拍由下向上揮，前臂內旋；擊球瞬間成個球要低過 1.15 米（BWF 規則）。', focus: 'wrist', muscles: ['forearm', 'chest', 'fingers'], checks: [C.serveHeight] },
      { t: 1.45, title: '隨揮', cue: '球拍順勢隨揮到左肩上方，重心移去前腳，即刻準備。', focus: 'trunk', muscles: ['core'] },
    ],
  };
})();

const LOW_SERVE: Move = (() => {
  const CT = 0.9;
  const base = { x: 0.15, z: -0.05, yaw: 0, lean: 12, footL: foot(-0.15, -0.28, -25), footR: foot(0.35, 0.05, 0) };
  return {
    id: 'lowServe',
    name: '反手發網前球',
    category: '發球',
    summary: '右腳在前，反手握拍將拍放喺身前腰下；左手拎球喺拍面前。用拇指短促平穩推，令球貼網過、落喺前發球線附近。',
    duration: 2.0,
    contactT: CT,
    shuttleIn: [0, -0.2, 0],
    shuttleOut: [1, 0.25, 0],
    keys: [
      { t: 0, pose: P({ ...base, ...arm([0.85, -0.6, -0.15], 100, [0.45, -0.25, -0.85], [1, 0, 0], [0.5, -0.3, 1]), handL: hand('L', [0.95, -0.4, 0.45], 130) }, ['R', 150]) },
      { t: 0.6, pose: P({ ...base, ...arm([0.8, -0.62, -0.15], 95, [0.4, -0.25, -0.85], [1, 0, 0], [0.5, -0.3, 1]), handL: hand('L', [0.95, -0.4, 0.45], 130) }, ['R', 150]) },
      { t: CT, pose: P({ ...base, ...arm([0.9, -0.55, -0.1], 112, [0.6, -0.15, -0.75], [1, 0.15, 0], [0.5, -0.3, 1]), handL: hand('L', [0.5, -0.6, -0.3], 120) }, ['R', 150]) },
      { t: 1.2, pose: P({ ...base, ...arm([0.9, -0.5, -0.1], 115, [0.6, 0.0, -0.75], [1, 0.2, 0], [0.5, -0.3, 1]), handL: hand('L', [0.5, -0.6, -0.3], 120) }, ['R', 148]) },
      { t: 1.6, pose: READY },
      { t: 2.0, pose: READY },
    ],
    steps: [
      { t: 0, title: '站位', cue: '右腳在前，重心微微向前；反手握拍，拍喺身前腰下；左手拎住球放喺拍面前。', focus: 'legs', muscles: ['quads', 'fingers'] },
      { t: 0.6, title: '細引拍', cue: '球拍只係向後少少，唔好大動作。', focus: 'wrist', muscles: ['forearm'] },
      { t: CT, title: '推', cue: '放球同時拇指短促平穩向前推，擊球點低過 1.15 米（BWF 規則），球剛好擦網頂過。', focus: 'wrist', muscles: ['fingers', 'forearm'], checks: [C.serveHeight] },
      { t: 1.2, title: '準備', cue: '發完即刻舉拍上前，準備對方放網或撲球。', focus: 'legs', muscles: ['quads'] },
    ],
  };
})();

export const MOVES: Move[] = [
  SPLIT,
  overhead('clear'),
  overhead('smash'),
  overhead('drop'),
  overhead('slice'),
  ROUND_HEAD,
  BACKHAND_CLEAR,
  drive(false),
  drive(true),
  BLOCK,
  netMove('net'),
  netMove('backhandNet'),
  netMove('netKill'),
  netMove('lift'),
  HIGH_SERVE,
  LOW_SERVE,
];

export const CATEGORIES: Category[] = ['步法', '後場', '中場', '前場', '發球'];
