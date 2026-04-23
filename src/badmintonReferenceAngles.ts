/**
 * badmintonReferenceAngles.ts
 *
 * Biomechanics reference angles for real-time badminton feedback.
 *
 * Sources:
 *   - Biomechanical Analysis of Badminton Smash (university study, 2025):
 *     knee ~110° prep, elbow ~80° start of swing, ~148° at contact, wrist ~25° at contact
 *   - Biomechanical Analysis on Skilled Players During Take-Off (PMC 2022):
 *     knee 128° initial contact (fast), 114° minimum during jump
 *   - Biomechanical Effects of Split-Step on Forecourt Lunge (PMC 2024):
 *     split-step increases hip abduction, affects knee flexion at foot contact
 *   - Net Shot Biomechanics Study (ISB 2009):
 *     elbow ~139–142° at contact for dab/tumble net shots
 *   - Forehand Clear & Drop Kinematics (IISTE / Uni Konstanz / OIIRJ 2019):
 *     overhead clear elbow extended; drop shot smaller angle for deception
 *   - Power Strokes Biomechanics Review:
 *     high elbow, upper arm well abducted, racket head on edge in backswing
 *   - Forehand Overhead Clear (BBC / YouTube coaching):
 *     elbow bent 90° in backswing; elbow above shoulder at contact
 *   - Lin Dan / Lee Chong Wei footwork analysis:
 *     low center of gravity, wide base, explosive split-step
 *   - Smash Myth Debunking (Reddit, expert-cited):
 *     do NOT pull elbow forward manually; shoulder-line alignment at preparation
 *   - Split-step coaching:
 *     feet slightly wider than shoulder width, forefoot landing, slight knee bend
 */

// ---------------------------------------------------------------------------
// 1.  SHARED CONSTANTS
// ---------------------------------------------------------------------------

/**
 * MediaPipe visibility threshold — below this, the landmark is unreliable.
 * Keep consistent with feedbackEngine.ts.
 */
export const VISIBILITY_THRESHOLD = 0.5;

/**
 * Tolerance applied to all angle ranges so minor deviations
 * don't trigger feedback on every frame.
 */
export const ANGLE_TOLERANCE = 8; // degrees

// ---------------------------------------------------------------------------
// 2.  TYPES
// ---------------------------------------------------------------------------

export type Phase =
  | 'idle'           // player standing, no stroke initiated
  | 'preparation'    // body turning, weight shifting, racket raising
  | 'backswing'      // racket drawn back / down, elbow rises
  | 'forward_swing'  // elbow-led swing toward shuttle
  | 'contact'        // moment of impact
  | 'follow_through'; // racket swings through after contact

export type ShotMode = 'smash' | 'clear' | 'drop' | 'net' | 'auto';

export type CameraAngle = 'front' | 'side';

export interface AngleRange {
  /** Inclusive minimum angle in degrees. */
  min: number;
  /** Inclusive maximum angle in degrees. */
  max: number;
  /** Human-readable description of what this measures. */
  description: string;
}

export interface PostureReference {
  /** Shot / movement name, used as key throughout the app. */
  name: string;
  /**
   * Short coaching note. Shown in the "why this matters" tooltip.
   * Based on expert technique descriptions from Lin Dan / LCW analysis.
   */
  coachingNote: string;
  phases: Partial<Record<Phase, PhaseAngles>>;
  /**
   * Lower-body reference applies across all phases for this movement.
   * Checked continuously while the movement is detected.
   */
  lowerBody: LowerBodyReference;
}

export interface PhaseAngles {
  /**
   * Angle at the racket-hand elbow (shoulder → elbow → wrist).
   * "Low" means more bent (arm folded); "high" means more extended (arm straight).
   */
  racketElbow: AngleRange;
  /**
   * Elevation of the racket shoulder above the hip line.
   * Expressed as the angle: hip → shoulder → horizontal.
   * Higher value = shoulder raised more.
   */
  racketShoulderElevation?: AngleRange;
  /**
   * Trunk/torso rotation angle.
   * Measured as the angle between shoulder line and hip line (top view proxy).
   * >0 = rotated toward racket side; side-on position = ~90°.
   */
  trunkRotation?: AngleRange;
  /**
   * Wrist extension/flexion angle at the point of contact.
   * Positive = wrist cocked / extended back; negative = wrist snapped forward.
   */
  wristAngle?: AngleRange;
}

export interface LowerBodyReference {
  /**
   * Knee flexion angle during the movement.
   * 180° = fully straight; <140° = noticeably bent.
   */
  kneeFlexion: AngleRange;
  /**
   * Stance width as a ratio of ankle-to-ankle distance / hip-to-ankle height.
   * 1.0 = shoulder-width; 1.4+ = wide lunge base.
   */
  stanceWidthRatio: AngleRange;
  /**
   * Whether the player should be landing on the forefoot (not flat-footed).
   * Coaching cue only; cannot be measured from 2D landmarks alone.
   */
  forefootContact: boolean;
  /** Optional description of footwork pattern. */
  description: string;
}

// ---------------------------------------------------------------------------
// 3.  REFERENCE DATA PER SHOT / MOVEMENT
// ---------------------------------------------------------------------------

/**
 * FOREHAND OVERHEAD SMASH
 *
 * Lin Dan / Lee Chong Wei characteristics:
 *   - Aggressive early preparation; elbow rises high in backswing
 *   - At contact: arm nearly fully extended, elbow ~148°
 *   - Elbow points BACKWARD (not forward, not sideways) during preparation
 *   - Shoulder alignment: racket shoulder, non-racket shoulder, and shuttle in one line at prep
 *   - Wrist snap: ~25° flex at contact
 *   - Knee angle: ~110° in jump/preparation (storing energy); 128° at initial landing contact
 *   - LCW uses frequent jump smashes; low center of gravity before takeoff
 */
export const SMASH: PostureReference = {
  name: 'Forehand Overhead Smash',
  coachingNote:
    'Drive elbow high in backswing, then extend forward and snap the wrist at contact. ' +
    'Keep the elbow pointing backward — not sideways — for maximum power transfer. ' +
    'Lin Dan and Lee Chong Wei both load deeply on the rear leg before the swing.',
  phases: {
    backswing: {
      racketElbow: {
        min: 70,
        max: 100,
        description:
          'Elbow sharply bent in backswing (~80°). ' +
          'Elbow should be rising upward, pointing backward toward the shuttle.',
      },
      racketShoulderElevation: {
        min: 80,
        max: 110,
        description:
          'Racket shoulder elevated well above hip; upper arm abducted from trunk.',
      },
      trunkRotation: {
        min: 70,
        max: 100,
        description:
          'Sideways body position; shoulder line near perpendicular to net.',
      },
    },
    forward_swing: {
      racketElbow: {
        min: 100,
        max: 140,
        description:
          'Elbow extending rapidly as arm leads the swing toward contact.',
      },
      trunkRotation: {
        min: 30,
        max: 70,
        description:
          'Torso uncoiling — hips and shoulders rotating together for power.',
      },
    },
    contact: {
      racketElbow: {
        min: 140,
        max: 165,
        description:
          'Elbow near full extension at contact (~148° mean from biomechanics study). ' +
          'Hitting at highest reachable point with elbow above shoulder height.',
      },
      racketShoulderElevation: {
        min: 140,
        max: 175,
        description:
          'Arm fully raised; contact point at or above head height.',
      },
      wristAngle: {
        min: 15,
        max: 35,
        description:
          'Wrist cocked back ~25° just before snapping forward at contact.',
      },
      trunkRotation: {
        min: 10,
        max: 40,
        description:
          'Body rotated to face the net at contact; full trunk uncoil completed.',
      },
    },
    follow_through: {
      racketElbow: {
        min: 80,
        max: 130,
        description:
          'Elbow flexes again as racket swings across body after contact. ' +
          'Forearm pronation should continue into follow-through.',
      },
    },
  },
  lowerBody: {
    kneeFlexion: {
      min: 100,
      max: 130,
      description:
        'Knees bent ~110° in preparation — stores elastic energy for upward jump thrust. ' +
        'Research: mean 110° ± 6° in prep phase.',
    },
    stanceWidthRatio: {
      min: 1.0,
      max: 1.6,
      description:
        'Feet roughly shoulder-to-hip width apart at preparation; ' +
        'LCW and Lin Dan both load on rear leg before explosive push-off.',
    },
    forefootContact: true,
    description:
      'Rear-leg loading before takeoff; scissor-kick landing. ' +
      'Lin Dan: low center of gravity, explosive acceleration. ' +
      'LCW: frequent jump smash, quick recovery to center afterward.',
  },
};

// ---------------------------------------------------------------------------

/**
 * FOREHAND OVERHEAD CLEAR
 *
 * Similar preparation to smash; key differences:
 *   - Contact point further behind head (hit later to send shuttle deep)
 *   - Arm fully extended at contact; racket angle flatter than smash
 *   - BBC coaching: elbow bent 90° in backswing; straighten on forward swing
 *   - Forearm pronation is the primary power source; elbow extension secondary
 *   - Drop and Clear use same preparation — deception is in contact adjustment
 */
export const CLEAR: PostureReference = {
  name: 'Forehand Overhead Clear',
  coachingNote:
    'Preparation is identical to the smash — opponent cannot read it early. ' +
    'Elbow bends 90° in backswing; straighten and rotate the forearm to send shuttle deep. ' +
    'Hit the shuttle slightly behind your body for maximum depth.',
  phases: {
    backswing: {
      racketElbow: {
        min: 80,
        max: 100,
        description:
          'Elbow at approximately 90° in backswing; racket head on edge (pointing down). ' +
          'BBC coaching cue: "elbow bent, racket behind head."',
      },
      racketShoulderElevation: {
        min: 80,
        max: 110,
        description: 'Upper arm abducted; high elbow position same as smash preparation.',
      },
      trunkRotation: {
        min: 70,
        max: 100,
        description: 'Full sideways position, weight transferred onto back foot.',
      },
    },
    contact: {
      racketElbow: {
        min: 155,
        max: 180,
        description:
          'Elbow fully extended at contact or very close to full extension. ' +
          'Hitting point slightly further behind head than smash.',
      },
      racketShoulderElevation: {
        min: 150,
        max: 180,
        description: 'Arm raised fully; contact at highest point possible.',
      },
      trunkRotation: {
        min: 10,
        max: 40,
        description: 'Trunk rotated to face net at contact.',
      },
    },
    follow_through: {
      racketElbow: {
        min: 90,
        max: 140,
        description:
          'Racket continues through naturally; forearm pronation completes the stroke.',
      },
    },
  },
  lowerBody: {
    kneeFlexion: {
      min: 110,
      max: 145,
      description:
        'Moderate knee bend during preparation; weight shifted to rear foot. ' +
        'Slightly less loaded than smash as no explosive jump required in most clears.',
    },
    stanceWidthRatio: {
      min: 1.0,
      max: 1.5,
      description:
        'Shoulder-width or slightly wider stance; rear leg lunge toward back tramline.',
    },
    forefootContact: false,
    description:
      'Rear-court stance; weight on rear foot in preparation. ' +
      'Recovery to base center immediately after contact.',
  },
};

// ---------------------------------------------------------------------------

/**
 * FOREHAND OVERHEAD DROP SHOT
 *
 * Key distinction from clear/smash:
 *   - Identical preparation to smash and clear (deception is the whole point)
 *   - Smaller racket angle and slower arm speed at contact compared to smash
 *   - Hip angle shows greater variability (70–109°) as player adjusts for balance
 *   - Forearm pronation reduced; wrist slows down to control placement
 *   - Contact point is slightly in front of body compared to clear
 */
export const DROP: PostureReference = {
  name: 'Forehand Overhead Drop Shot',
  coachingNote:
    "Preparation MUST look identical to a smash — that is what makes a drop shot effective. " +
    'The deception happens only at contact: slow the forearm rotation and angle the racket face. ' +
    "Lin Dan's disguise comes from identical body shape until the last moment.",
  phases: {
    backswing: {
      racketElbow: {
        min: 80,
        max: 100,
        description:
          'Identical to smash backswing — no telegraphing the drop.',
      },
      trunkRotation: {
        min: 70,
        max: 100,
        description: 'Full sideways position. Identical to smash preparation.',
      },
    },
    contact: {
      racketElbow: {
        min: 130,
        max: 160,
        description:
          'Slightly less extended than smash — arm decelerates before contact. ' +
          'Smaller angle compared to smash (148°) produces the deceptive angle.',
      },
      racketShoulderElevation: {
        min: 130,
        max: 165,
        description:
          'Arm elevated but contact slightly more in front of body vs. clear.',
      },
      trunkRotation: {
        min: 15,
        max: 50,
        description:
          'Trunk rotates but hip angle more variable (70–109°) to adjust drop placement.',
      },
    },
  },
  lowerBody: {
    kneeFlexion: {
      min: 110,
      max: 145,
      description: 'Similar lower body to clear; no explosive jump needed.',
    },
    stanceWidthRatio: {
      min: 1.0,
      max: 1.5,
      description: 'Shoulder-width stance; controlled weight transfer.',
    },
    forefootContact: false,
    description: 'Rear-court position same as clear; recovery is quick to midcourt.',
  },
};

// ---------------------------------------------------------------------------

/**
 * FOREHAND NET SHOT (DAB / TUMBLE)
 *
 * Based on ISB 2009 net shot biomechanics study:
 *   - Elbow angle at contact: ~139–142° for both dab and tumble
 *   - Key difference between dab and tumble: wrist and forearm velocity (not proximal joints)
 *   - Tumble net shot requires significantly higher wrist flexion + ulnar flex + pronation velocity
 *   - Shoulder movement is NOT the power source for net shots; it is the distal wrist/forearm
 *   - Forehand lunge: hip to knee angle ~130–150° during approach
 *   - Forefoot contact essential for quick recovery
 *   - Racket arm extended forward; elbow slightly bent at contact
 */
export const NET_SHOT: PostureReference = {
  name: 'Forehand Net Shot',
  coachingNote:
    'Reach forward with a slightly bent elbow (~140°) — do not fully extend or you lose wrist control. ' +
    'The power comes entirely from the wrist snap, not the shoulder. ' +
    'Stay low with the lunge knee bent; recover on the forefoot for a quick push back to center.',
  phases: {
    preparation: {
      racketElbow: {
        min: 100,
        max: 140,
        description:
          'Elbow partially bent as racket is brought forward and up for net approach.',
      },
      racketShoulderElevation: {
        min: 60,
        max: 100,
        description: 'Shoulder raised forward and up toward the net tape.',
      },
    },
    contact: {
      racketElbow: {
        min: 130,
        max: 150,
        description:
          'Elbow at ~139–142° at contact. Arm reaches forward but remains slightly bent ' +
          'to enable the critical wrist snap (dab) or flick (tumble).',
      },
      racketShoulderElevation: {
        min: 80,
        max: 120,
        description:
          'Shoulder elevated and reaching over the net; contact point as high and early as possible.',
      },
    },
    follow_through: {
      racketElbow: {
        min: 100,
        max: 145,
        description:
          'Small follow-through; racket does not swing far past contact point. ' +
          'Wrist decelerates quickly after snap — especially important for tumble net shot.',
      },
    },
  },
  lowerBody: {
    kneeFlexion: {
      min: 100,
      max: 140,
      description:
        'Front knee deeply bent during forecourt lunge (~110–130°). ' +
        'Low center of gravity required for balance and rapid recovery.',
    },
    stanceWidthRatio: {
      min: 1.2,
      max: 2.0,
      description:
        'Wide lunge stance — front foot extends well toward the net post. ' +
        'Rear leg braced for push-back. PMC 2024: split-step increases hip abduction at landing.',
    },
    forefootContact: true,
    description:
      'Forecourt lunge with forefoot landing on front foot. ' +
      'Rear foot pushes off the ground explosively for recovery. ' +
      'Quick return to base position after contact is essential.',
  },
};

// ---------------------------------------------------------------------------

/**
 * READY POSITION (Split-Step / Base Position)
 *
 * The ready position is the neutral stance between shots.
 * Coaching references:
 *   - Feet slightly wider than shoulder width
 *   - Weight on forefeet, slight knee bend (~140–160°)
 *   - Racket up in front, arm relaxed but ready
 *   - Body balanced and centered on court
 *   - Lin Dan / LCW: consistently return to exact center base between shots
 */
export const READY_POSITION: PostureReference = {
  name: 'Ready Position',
  coachingNote:
    'Return to the T-junction center after every shot. ' +
    'Weight on forefeet, knees slightly bent — never flat-footed. ' +
    'Racket held up in front; elbow relaxed and slightly bent for quick reaction.',
  phases: {
    idle: {
      racketElbow: {
        min: 100,
        max: 150,
        description:
          'Elbow relaxed and slightly bent; racket held forward and up, ready to react.',
      },
      racketShoulderElevation: {
        min: 30,
        max: 70,
        description: 'Shoulder in neutral position — neither fully raised nor dropped.',
      },
    },
  },
  lowerBody: {
    kneeFlexion: {
      min: 140,
      max: 165,
      description:
        'Slight knee bend — joints loaded and ready to spring. ' +
        '180° = fully locked out (too rigid); <130° = unnecessarily deep (tiring). ' +
        'Split-step target: ~150° at landing.',
    },
    stanceWidthRatio: {
      min: 0.9,
      max: 1.4,
      description:
        'Feet slightly wider than shoulder width. ' +
        'Wider than this reduces lateral speed; narrower reduces stability.',
    },
    forefootContact: true,
    description:
      'Forefoot-loaded stance at court center (T-junction). ' +
      'Perform a split-step as the opponent contacts the shuttle to pre-load legs for reaction.',
  },
};

// ---------------------------------------------------------------------------

/**
 * LUNGE (Generic Forecourt / Rear-Court Lunge)
 *
 * Used for any large-step retrieve:
 *   - Front knee angle at landing: ~110–140° (deep bend = better reach, harder recovery)
 *   - PMC 2024 split-step study: larger hip abduction with split-step enhances lunge mechanics
 *   - Hip height drops significantly; center of gravity lowers for balance
 *   - Rear leg remains braced for push-back power
 *   - Front foot points toward the shuttle (not sideways) on a forehand lunge
 */
export const LUNGE: PostureReference = {
  name: 'Lunge',
  coachingNote:
    'Drive the front knee over the foot — do not let it collapse inward. ' +
    'Keep the rear leg extended and braced to push back quickly. ' +
    'Low center of gravity is essential; resist the urge to stand up before you hit.',
  phases: {
    preparation: {
      racketElbow: {
        min: 80,
        max: 150,
        description:
          'Arm position varies by shot type during the lunge. ' +
          'Focus cue: get low first, then place the racket.',
      },
    },
    contact: {
      racketElbow: {
        min: 90,
        max: 155,
        description:
          'Elbow angle depends on shot type — net shot ~140°, low clear ~155°. ' +
          'Arm extended toward the shuttle with controlled wrist.',
      },
    },
  },
  lowerBody: {
    kneeFlexion: {
      min: 100,
      max: 140,
      description:
        'Front knee bent ~110–130° at deepest point of lunge. ' +
        'Deeper bend = greater reach but higher recovery cost. ' +
        'PMC 2022: takeoff knee ~114° minimum in explosive jump scenarios.',
    },
    stanceWidthRatio: {
      min: 1.3,
      max: 2.2,
      description:
        'Wide base — front foot significantly ahead of rear foot. ' +
        'Ratio increases proportionally with lunge depth.',
    },
    forefootContact: true,
    description:
      'Front foot lands on forefoot pointed toward the shuttle. ' +
      'Rear leg remains grounded as a push-off base. ' +
      'Quick recovery: push off front foot and step back to center.',
  },
};

// ---------------------------------------------------------------------------
// 4.  LOOKUP MAP
// ---------------------------------------------------------------------------

/**
 * Map from ShotMode key to its PostureReference data.
 * Use this to retrieve the correct reference in feedbackEngine.ts.
 */
export const SHOT_REFERENCE: Record<Exclude<ShotMode, 'auto'>, PostureReference> = {
  smash: SMASH,
  clear: CLEAR,
  drop:  DROP,
  net:   NET_SHOT,
};
