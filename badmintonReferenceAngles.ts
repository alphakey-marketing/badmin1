/**
 * badmintonReferenceAngles.ts
 *
 * Biomechanics reference angles for real-time badminton feedback.
 *
 * Sources:
 *   - Biomechanical Analysis of Badminton Smash (university study, 2025):
 *     knee ~110° prep, elbow ~80° start of swing, ~148° at contact, wrist ~25° at contact [web:56][web:74]
 *   - Biomechanical Analysis on Skilled Players During Take-Off (PMC 2022):
 *     knee 128° initial contact (fast), 114° minimum during jump [web:61]
 *   - Biomechanical Effects of Split-Step on Forecourt Lunge (PMC 2024):
 *     split-step increases hip abduction, affects knee flexion at foot contact [web:73]
 *   - Net Shot Biomechanics Study (ISB 2009):
 *     elbow ~139–142° at contact for dab/tumble net shots [web:69]
 *   - Forehand Clear & Drop Kinematics (IISTE / Uni Konstanz / OIIRJ 2019):
 *     overhead clear elbow extended; drop shot smaller angle for deception [web:72][web:77][web:90]
 *   - Power Strokes Biomechanics Review:
 *     high elbow, upper arm well abducted, racket head on edge in backswing [web:81]
 *   - Forehand Overhead Clear (BBC / YouTube coaching):
 *     elbow bent 90° in backswing; elbow above shoulder at contact [web:93][web:91]
 *   - Lin Dan / Lee Chong Wei footwork analysis:
 *     low center of gravity, wide base, explosive split-step [web:86][web:89][web:92]
 *   - Smash Myth Debunking (Reddit, expert-cited):
 *     do NOT pull elbow forward manually; shoulder-line alignment at preparation [web:55]
 *   - Split-step coaching:
 *     feet slightly wider than shoulder width, forefoot landing, slight knee bend [web:75][web:78]
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
  | 'preparation'   // body turning, weight shifting, racket raising
  | 'backswing'     // racket drawn back / down, elbow rises
  | 'forward_swing' // elbow-led swing toward shuttle
  | 'contact'       // moment of impact
  | 'follow_through'; // racket swings through after contact

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
 *   - Aggressive early preparation; elbow rises high in backswing [web:81][web:91]
 *   - At contact: arm nearly fully extended, elbow ~148° [web:74]
 *   - Elbow points BACKWARD (not forward, not sideways) during preparation [web:88]
 *   - Shoulder alignment: racket shoulder, non-racket shoulder, and shuttle in one line at prep [web:55]
 *   - Wrist snap: ~25° flex at contact [web:56]
 *   - Knee angle: ~110° in jump/preparation (storing energy); 128° at initial landing contact [web:56][web:61]
 *   - LCW uses frequent jump smashes; low center of gravity before takeoff [web:89]
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
          'Elbow should be rising upward, pointing backward toward the shuttle. [web:56][web:81]',
      },
      racketShoulderElevation: {
        min: 80,
        max: 110,
        description:
          'Racket shoulder elevated well above hip; upper arm abducted from trunk. [web:81]',
      },
      trunkRotation: {
        min: 70,
        max: 100,
        description:
          'Sideways body position; shoulder line near perpendicular to net. [web:84]',
      },
    },
    forward_swing: {
      racketElbow: {
        min: 100,
        max: 140,
        description:
          'Elbow extending rapidly as arm leads the swing toward contact. [web:56][web:74]',
      },
      trunkRotation: {
        min: 30,
        max: 70,
        description:
          'Torso uncoiling — hips and shoulders rotating together for power. [web:91]',
      },
    },
    contact: {
      racketElbow: {
        min: 140,
        max: 165,
        description:
          'Elbow near full extension at contact (~148° mean from biomechanics study). ' +
          'Hitting at highest reachable point with elbow above shoulder height. [web:74][web:91]',
      },
      racketShoulderElevation: {
        min: 140,
        max: 175,
        description:
          'Arm fully raised; contact point at or above head height. [web:91]',
      },
      wristAngle: {
        min: 15,
        max: 35,
        description:
          'Wrist cocked back ~25° just before snapping forward at contact. [web:56]',
      },
      trunkRotation: {
        min: 10,
        max: 40,
        description:
          'Body rotated to face the net at contact; full trunk uncoil completed. [web:84]',
      },
    },
    follow_through: {
      racketElbow: {
        min: 80,
        max: 130,
        description:
          'Elbow flexes again as racket swings across body after contact. ' +
          'Forearm pronation should continue into follow-through. [web:82]',
      },
    },
  },
  lowerBody: {
    kneeFlexion: {
      min: 100,
      max: 130,
      description:
        'Knees bent ~110° in preparation — stores elastic energy for upward jump thrust. ' +
        'Research: mean 110° ± 6° in prep phase. [web:56][web:61]',
    },
    stanceWidthRatio: {
      min: 1.0,
      max: 1.6,
      description:
        'Feet roughly shoulder-to-hip width apart at preparation; ' +
        'LCW and Lin Dan both load on rear leg before explosive push-off. [web:86]',
    },
    forefootContact: true,
    description:
      'Rear-leg loading before takeoff; scissor-kick landing. ' +
      'Lin Dan: low center of gravity, explosive acceleration. ' +
      'LCW: frequent jump smash, quick recovery to center afterward. [web:89][web:92]',
  },
};

// ---------------------------------------------------------------------------

/**
 * FOREHAND OVERHEAD CLEAR
 *
 * Similar preparation to smash; key differences:
 *   - Contact point further behind head (hit later to send shuttle deep)
 *   - Arm fully extended at contact; racket angle flatter than smash [web:81][web:90]
 *   - BBC coaching: elbow bent 90° in backswing; straighten on forward swing [web:93]
 *   - Forearm pronation is the primary power source; elbow extension secondary [web:81]
 *   - Drop and Clear use same preparation — deception is in contact adjustment [web:90]
 */
export const CLEAR: PostureReference = {
  name: 'Forehand Overhead Clear',
  coachingNote:
    'Preparation is identical to the smash — opponent cannot read it early. ' +
    'Elbow bends 90° in backswing; straighten and rotate the forearm to send shuttle deep. ' +
    'Hit the shuttle slightly behind your body for maximum depth. [web:81][web:93]',
  phases: {
    backswing: {
      racketElbow: {
        min: 80,
        max: 100,
        description:
          'Elbow at approximately 90° in backswing; racket head on edge (pointing down). ' +
          'BBC coaching cue: "elbow bent, racket behind head." [web:93]',
      },
      racketShoulderElevation: {
        min: 80,
        max: 110,
        description: 'Upper arm abducted; high elbow position same as smash preparation. [web:81]',
      },
      trunkRotation: {
        min: 70,
        max: 100,
        description: 'Full sideways position, weight transferred onto back foot. [web:93]',
      },
    },
    contact: {
      racketElbow: {
        min: 155,
        max: 180,
        description:
          'Elbow fully extended at contact or very close to full extension. ' +
          'Hitting point slightly further behind head than smash. [web:81][web:90]',
      },
      racketShoulderElevation: {
        min: 150,
        max: 180,
        description: 'Arm raised fully; contact at highest point possible. [web:81]',
      },
      trunkRotation: {
        min: 10,
        max: 40,
        description: 'Trunk rotated to face net at contact. [web:90]',
      },
    },
    follow_through: {
      racketElbow: {
        min: 90,
        max: 140,
        description:
          'Racket continues through naturally; forearm pronation completes the stroke. [web:81]',
      },
    },
  },
  lowerBody: {
    kneeFlexion: {
      min: 110,
      max: 145,
      description:
        'Moderate knee bend during preparation; weight shifted to rear foot. ' +
        'Slightly less loaded than smash as no explosive jump required in most clears. [web:80]',
    },
    stanceWidthRatio: {
      min: 1.0,
      max: 1.5,
      description:
        'Shoulder-width or slightly wider stance; rear leg lunge toward back tramline. [web:80]',
    },
    forefootContact: false,
    description:
      'Rear-court stance; weight on rear foot in preparation. ' +
      'Recovery to base center immediately after contact. [web:80]',
  },
};

// ---------------------------------------------------------------------------

/**
 * FOREHAND OVERHEAD DROP SHOT
 *
 * Key distinction from clear/smash:
 *   - Identical preparation to smash and clear (deception is the whole point) [web:72][web:90]
 *   - Smaller racket angle and slower arm speed at contact compared to smash [web:77]
 *   - Hip angle shows greater variability (70–109°) as player adjusts for balance [web:64]
 *   - Forearm pronation reduced; wrist slows down to control placement [web:77]
 *   - Contact point is slightly in front of body compared to clear [web:90]
 */
export const DROP: PostureReference = {
  name: 'Forehand Overhead Drop Shot',
  coachingNote:
    'Preparation MUST look identical to a smash — that is what makes a drop shot effective. ' +
    'The deception happens only at contact: slow the forearm rotation and angle the racket face. ' +
    'Lin Dan\'s disguise comes from identical body shape until the last moment.',
  phases: {
    backswing: {
      racketElbow: {
        min: 80,
        max: 100,
        description:
          'Identical to smash backswing — no telegraphing the drop. [web:90]',
      },
      trunkRotation: {
        min: 70,
        max: 100,
        description: 'Full sideways position. Identical to smash preparation. [web:90]',
      },
    },
    contact: {
      racketElbow: {
        min: 130,
        max: 160,
        description:
          'Slightly less extended than smash — arm decelerates before contact. ' +
          'Smaller angle compared to smash (148°) produces the deceptive angle. [web:72][web:77]',
      },
      racketShoulderElevation: {
        min: 130,
        max: 165,
        description:
          'Arm elevated but contact slightly more in front of body vs. clear. [web:72][web:90]',
      },
      trunkRotation: {
        min: 15,
        max: 50,
        description:
          'Trunk rotates but hip angle more variable (70–109°) to adjust drop placement. [web:64]',
      },
    },
  },
  lowerBody: {
    kneeFlexion: {
      min: 110,
      max: 145,
      description: 'Similar lower body to clear; no explosive jump needed. [web:72]',
    },
    stanceWidthRatio: {
      min: 1.0,
      max: 1.5,
      description: 'Shoulder-width stance; controlled weight transfer. [web:72]',
    },
    forefootContact: false,
    description: 'Rear-court position same as clear; recovery is quick to midcourt. [web:72]',
  },
};

// ---------------------------------------------------------------------------

/**
 * FOREHAND NET SHOT (DAB / TUMBLE)
 *
 * Based on ISB 2009 net shot biomechanics study [web:69][web:71]:
 *   - Elbow angle at contact: ~139–142° for both dab and tumble
 *   - Key difference between dab and tumble: wrist and forearm velocity (not proximal joints)
 *   - Tumble net shot requires significantly higher wrist flexion + ulnar flex + pronation velocity
 *   - Shoulder movement is NOT the power source for net shots; it is the distal wrist/forearm [web:69]
 *   - Forehand lunge: hip
