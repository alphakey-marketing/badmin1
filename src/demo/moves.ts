/**
 * Demo moves for a right-handed player (mirrored in the viewer for left-handers).
 * Base position is the origin; the net is at x ≈ +3.3.
 *
 * Coaching sequences follow standard badminton teaching:
 *  - split step: small hop just before the opponent hits, land on the balls of the feet, wider than shoulders
 *  - rear forehand: turn side-on, chassé back, load the back (racket-side) leg, hips → shoulders → arm, scissor kick
 *  - forehand net: small first step, long last step with the racket-side foot, heel first, knee over the ankle
 */
import type { Foot, Key, Pose, Vec } from './rig';

export type Part = 'legs' | 'hips' | 'trunk' | 'shoulder' | 'elbow' | 'wrist' | 'none';

export interface Step {
  t: number;
  title: string;
  cue: string;
  focus: Part;
}

export interface Move {
  id: string;
  name: string;
  summary: string;
  duration: number;
  keys: Key[];
  steps: Step[];
  /** When the racket meets the shuttle, and where the shuttle goes afterwards. */
  contactT?: number;
  shuttleIn?: Vec; // direction the shuttle is travelling before contact (world)
  shuttleOut?: Vec; // direction it leaves
}

const foot = (x: number, z: number, yaw = 0, lift = 0): Foot => ({ x, z, yaw, lift });

const READY: Pose = {
  x: 0, z: 0, h: 0.84, yaw: 0, twist: 0, lean: 14,
  footL: foot(0.08, -0.27, -12), footR: foot(-0.08, 0.27, 12),
  handR: [0.38, -0.12, 0.3], headR: [0.5, 0.35, 0.42], faceR: [1, 0, 0],
  handL: [0.32, -0.12, -0.32],
  elbowR: [-0.2, -1, 0.8], elbowL: [-0.2, -1, -0.8],
};

const pose = (over: Partial<Pose>): Pose => ({ ...READY, ...over });

// ---------------------------------------------------------------------------

const SPLIT: Move = {
  id: 'split',
  name: '準備姿勢＋分腿跳',
  summary: '對手擊球前一刻做一個細細嘅分腿跳，落地時雙腳比肩闊、前腳掌著地，即刻可以向任何方向起動。',
  duration: 1.8,
  keys: [
    { t: 0, pose: READY },
    { t: 0.45, pose: pose({ h: 0.88, lean: 12 }) },
    { t: 0.6, pose: pose({ h: 0.94, lean: 10, footL: foot(0.06, -0.22, -10, 0.05), footR: foot(-0.06, 0.22, 10, 0.05) }) },
    { t: 0.75, pose: pose({ h: 0.78, lean: 16, footL: foot(0.08, -0.33, -15), footR: foot(-0.08, 0.33, 15) }) },
    { t: 1.1, pose: pose({ h: 0.8, lean: 15, footL: foot(0.08, -0.33, -15), footR: foot(-0.08, 0.33, 15) }) },
    { t: 1.8, pose: READY },
  ],
  steps: [
    { t: 0, title: '準備', cue: '微微屈膝，重心喺中間，上身微微前傾，拍頭舉起放喺身前。', focus: 'legs' },
    { t: 0.45, title: '起跳時機', cue: '對手準備擊球嗰下，輕輕彈起（唔係大跳）。', focus: 'legs' },
    { t: 0.75, title: '分腿落地', cue: '前腳掌著地，雙腳比肩膊闊，膝頭屈，好似彈簧咁準備起動。', focus: 'legs' },
    { t: 1.1, title: '起動', cue: '睇清楚來球方向，用離目標較遠嗰隻腳蹬地起步。', focus: 'hips' },
  ],
};

// ---------------------------------------------------------------------------
// Rear forehand overhead (clear / smash / drop share the same preparation)

function overhead(kind: 'clear' | 'smash' | 'drop'): Move {
  const jump = kind === 'smash' ? 0.12 : 0.05;
  const contactHand: Vec = kind === 'smash' ? [0.4, 0.6, 0.18] : kind === 'clear' ? [0.18, 0.68, 0.18] : [0.32, 0.64, 0.18];
  const contactHead: Vec = kind === 'smash' ? [0.85, 0.95, 0.12] : kind === 'clear' ? [0.35, 1.2, 0.12] : [0.7, 1.05, 0.12];
  const contactFace: Vec = kind === 'smash' ? [1, -0.25, 0] : kind === 'clear' ? [0.75, 0.65, 0] : [0.95, 0.25, 0];
  const C = 1.7; // contact time
  const keys: Key[] = [
    { t: 0, pose: READY },
    { t: 0.25, pose: pose({ h: 0.78, footL: foot(0.08, -0.33, -15), footR: foot(-0.08, 0.33, 15) }) },
    // Turn side-on: right foot steps back-right, body turns right
    {
      t: 0.55,
      pose: pose({
        x: -0.35, z: 0.2, h: 0.84, yaw: 60, twist: 10, lean: 5,
        footL: foot(0.05, -0.2, 20), footR: foot(-0.75, 0.55, 80),
        handR: [0.05, 0.2, 0.32], headR: [0.0, 0.7, 0.4], faceR: [0, 0, 1],
        handL: [0.3, 0.3, -0.35], elbowR: [-0.3, 0.2, 1], elbowL: [0.2, -0.5, -1],
      }),
    },
    // Chassé: left foot closes towards the right foot
    {
      t: 0.8,
      pose: pose({
        x: -0.95, z: 0.5, h: 0.88, yaw: 75, twist: 8, lean: 2,
        footL: foot(-0.55, 0.3, 40, 0.05), footR: foot(-0.75, 0.55, 80, 0),
        handR: [0.0, 0.25, 0.32], headR: [-0.05, 0.75, 0.4], faceR: [0, 0, 1],
        handL: [0.35, 0.4, -0.3], elbowR: [-0.3, 0.3, 1], elbowL: [0.2, -0.3, -1],
      }),
    },
    // Right foot steps back again
    {
      t: 1.05,
      pose: pose({
        x: -1.6, z: 0.8, h: 0.85, yaw: 82, twist: 5, lean: 0,
        footL: foot(-0.7, 0.35, 45), footR: foot(-2.0, 1.15, 85, 0.03),
        handR: [-0.02, 0.25, 0.3], headR: [-0.15, 0.7, 0.4], faceR: [0, 0, 1],
        handL: [0.38, 0.5, -0.28], elbowR: [-0.3, 0.4, 1], elbowL: [0.2, -0.2, -1],
      }),
    },
    // Load: weight on the back (right) leg, left arm points at the shuttle, racket drops behind
    {
      t: 1.38,
      pose: pose({
        x: -2.05, z: 1.0, h: 0.79, yaw: 85, twist: 5, lean: -8,
        footL: foot(-1.45, 0.65, 50), footR: foot(-2.4, 1.25, 85),
        handR: [-0.08, 0.22, 0.26], headR: [-0.45, -0.1, 0.32], faceR: [0, 0, 1],
        handL: [0.38, 0.55, -0.22], elbowR: [-0.4, 0.6, 1], elbowL: [0.2, 0, -1],
      }),
    },
    // Drive: push off the back leg, hips turn first (pelvis yaw drops, chest still lags)
    {
      t: 1.58,
      pose: pose({
        x: -2.0, z: 0.98, h: 0.88 + jump * 0.5, yaw: 50, twist: 22, lean: -4,
        footL: foot(-1.45, 0.65, 50, jump * 0.4), footR: foot(-2.4, 1.25, 85, jump * 0.6),
        handR: [0.0, 0.45, 0.26], headR: [-0.35, 0.15, 0.36], faceR: [0, 0, 1],
        handL: [0.3, 0.25, -0.2], elbowR: [-0.2, 0.8, 1], elbowL: [0, -0.6, -1],
      }),
    },
    // Contact: shoulders face the net, arm straight up, forearm turns (pronation)
    {
      t: C,
      pose: pose({
        x: -1.95, z: 0.95, h: 0.94 + jump, yaw: 22, twist: -6, lean: kind === 'smash' ? 10 : 2,
        footL: foot(-1.5, 0.6, 30, jump), footR: foot(-2.25, 1.2, 60, jump + 0.06),
        handR: contactHand, headR: contactHead, faceR: contactFace,
        handL: [0.22, -0.05, -0.1], elbowR: [-0.2, 0.3, 1], elbowL: [0, -1, -0.5],
      }),
    },
    // Follow-through + scissor kick: right leg comes forward, left goes back
    {
      t: 1.95,
      pose: pose({
        x: -1.75, z: 0.85, h: 0.82, yaw: -8, twist: -15, lean: 14,
        footL: foot(-2.3, 0.75, 20), footR: foot(-1.35, 1.0, 10),
        handR: [0.35, -0.12, -0.2], headR: [0.55, -0.35, -0.55], faceR: [0, -0.3, -1],
        handL: [0.05, -0.3, -0.32], elbowR: [0, -1, 0.5],
      }),
    },
    // Recover towards the base
    {
      t: 2.45,
      pose: pose({
        x: -0.9, z: 0.45, h: 0.85, yaw: 15, twist: 0, lean: 12,
        footL: foot(-1.1, 0.15, -5, 0.04), footR: foot(-0.75, 0.75, 15),
      }),
    },
    { t: 3.0, pose: READY },
    { t: 3.4, pose: READY },
  ];

  const names = { clear: '後場正手高遠球', smash: '後場正手（跳）殺球', drop: '後場正手吊球' } as const;
  const summaries = {
    clear: '分腿 → 轉身側身 → 并步後退 → 後腳蓄力 → 蹬地轉髖 → 轉肩 → 伸直手臂喺最高點擊球 → 剪刀腳 → 回中。',
    smash: '同高遠球一樣嘅步法同準備，擊球點喺身體前面啲、拍面向下壓，跳起擊球。',
    drop: '準備動作要同殺球、高遠球一模一樣（對手睇唔穿），觸球一刻先減速、控制拍面。',
  };
  const contactCue = {
    clear: '擊球：喺頭頂稍後嘅最高點、手臂伸直，前臂內旋帶動拍面向前上，送球去底線。',
    smash: '擊球：擊球點喺身體前上方，前臂內旋＋手腕發力，拍面向下壓。',
    drop: '擊球：同樣揮拍，但觸球前減速，拍面輕輕推／切，令球剛過網就落。',
  };
  return {
    id: kind,
    name: names[kind],
    summary: summaries[kind],
    duration: 3.4,
    keys,
    contactT: C,
    shuttleIn: [-0.2, -1, 0],
    shuttleOut: kind === 'smash' ? [1, -0.22, -0.08] : kind === 'clear' ? [1, 0.6, -0.08] : [1, 0.05, -0.08],
    steps: [
      { t: 0, title: '分腿跳', cue: '對手擊球前分腿跳，睇到係後場高球。', focus: 'legs' },
      { t: 0.4, title: '轉身側身', cue: '右腳向右後方踏，身體轉側（左肩向網），球拍同手肘舉高。', focus: 'hips' },
      { t: 0.72, title: '并步後退', cue: '左腳靠近右腳（并步），右腳再向後踏。唔好打交叉腳。', focus: 'legs' },
      { t: 1.2, title: '蓄力', cue: '重心落喺後腳（右腳）屈膝；左手舉高指住球；手肘抬高，拍頭落到背後。', focus: 'legs' },
      { t: 1.5, title: '蹬地轉髖', cue: '後腳蹬地，髖部先轉向網，肩膊仲未轉（拉開髖肩夾角）。', focus: 'hips' },
      { t: 1.62, title: '轉肩帶手', cue: '肩膊跟住轉，手肘向上向前帶，左手收埋落胸前。', focus: 'shoulder' },
      { t: C, title: '擊球', cue: contactCue[kind], focus: 'wrist' },
      { t: 1.85, title: '剪刀腳＋隨揮', cue: '雙腳喺空中交換：右腳向前落地，左腳向後；球拍自然隨揮到身體左下方。', focus: 'legs' },
      { t: 2.3, title: '回中', cue: '右腳蹬返，快速回到中間準備位置。', focus: 'legs' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Forehand net lunge

const NET: Move = {
  id: 'net',
  name: '正手網前（上網弓步）',
  summary: '分腿 → 左腳細步 → 右腳大步弓步（腳踭先著地）→ 拍頭舉高早接球，用手指手腕搓／放網 → 前腳蹬返回中。',
  duration: 2.8,
  contactT: 1.3,
  shuttleIn: [-1, -0.6, 0],
  shuttleOut: [1, 0.9, -0.1],
  keys: [
    { t: 0, pose: READY },
    { t: 0.25, pose: pose({ h: 0.78, footL: foot(0.08, -0.33, -15), footR: foot(-0.08, 0.33, 15) }) },
    {
      t: 0.5,
      pose: pose({
        x: 0.35, z: 0.15, h: 0.86, yaw: 25, lean: 12,
        footL: foot(0.6, -0.05, 10), footR: foot(-0.05, 0.35, 25, 0.03),
        handR: [0.42, 0.0, 0.3], headR: [0.6, 0.45, 0.42],
      }),
    },
    {
      t: 0.8,
      pose: pose({
        x: 1.0, z: 0.42, h: 0.9, yaw: 30, lean: 10,
        footL: foot(0.75, 0.05, 15), footR: foot(1.35, 0.7, 35, 0.1),
        handR: [0.5, 0.02, 0.28], headR: [0.75, 0.45, 0.42],
      }),
    },
    // Lunge: right heel lands far forward; rear leg long
    {
      t: 1.08,
      pose: pose({
        x: 1.72, z: 0.72, h: 0.7, yaw: 35, lean: 12,
        footL: foot(0.85, 0.12, 20), footR: foot(2.3, 1.12, 35),
        handR: [0.58, 0.02, 0.24], headR: [0.92, 0.4, 0.42], faceR: [0.7, 0.7, 0],
        handL: [-0.2, -0.15, -0.38], elbowR: [-0.3, -0.6, 1],
      }),
    },
    {
      t: 1.3,
      pose: pose({
        x: 1.74, z: 0.73, h: 0.69, yaw: 35, lean: 12,
        footL: foot(0.85, 0.12, 20), footR: foot(2.3, 1.12, 35),
        handR: [0.6, 0.04, 0.22], headR: [0.98, 0.3, 0.34], faceR: [0.6, 0.8, 0],
        handL: [-0.22, -0.15, -0.38], elbowR: [-0.3, -0.6, 1],
      }),
    },
    // Push back with the front leg
    {
      t: 1.7,
      pose: pose({
        x: 1.1, z: 0.45, h: 0.84, yaw: 25, lean: 10,
        footL: foot(0.75, 0.05, 10), footR: foot(1.55, 0.8, 30, 0.06),
      }),
    },
    { t: 2.3, pose: READY },
    { t: 2.8, pose: READY },
  ],
  steps: [
    { t: 0, title: '分腿跳', cue: '對手擊球前分腿跳，睇到係網前球。', focus: 'legs' },
    { t: 0.4, title: '第一步', cue: '左腳先向前上一細步，身體向右前方。', focus: 'legs' },
    { t: 0.7, title: '跨步', cue: '右腳（持拍側）向前跨大步，拍頭一路舉高。', focus: 'legs' },
    { t: 1.0, title: '弓步落地', cue: '腳踭先著地，再到前腳掌；前腳膝頭對住腳尖方向、唔好超過腳尖；後腳伸直撐住，上身挺直。', focus: 'legs' },
    { t: 1.3, title: '觸球', cue: '手臂向前伸，用手指同手腕輕輕擦／推，唔使大揮拍。', focus: 'wrist' },
    { t: 1.6, title: '蹬返', cue: '前腳發力蹬返後，並步退回中間。', focus: 'legs' },
  ],
};

export const MOVES: Move[] = [SPLIT, overhead('clear'), overhead('smash'), overhead('drop'), NET];
