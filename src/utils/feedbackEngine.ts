import type {
  Landmark,
  FeedbackResult,
  RacketHand,
  Severity,
  CalibrationData,
  ShotMode,
  CameraAngle,
} from '../types';
import {
  LEFT_SHOULDER, RIGHT_SHOULDER,
  LEFT_ELBOW, RIGHT_ELBOW,
  LEFT_WRIST, RIGHT_WRIST,
  LEFT_HIP, RIGHT_HIP,
  LEFT_KNEE, RIGHT_KNEE,
  LEFT_ANKLE, RIGHT_ANKLE,
  absAngle3Points,
  landmarkDistance,
} from './poseUtils';
import {
  SHOT_REFERENCE,
  ANGLE_TOLERANCE,
  type Phase,
  type PostureReference,
} from '../badmintonReferenceAngles';

const VISIBILITY_THRESHOLD = 0.5;

function isVisible(lm: Landmark | undefined): lm is Landmark {
  return lm !== undefined && (lm.visibility ?? 1) >= VISIBILITY_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Phase detection
// ---------------------------------------------------------------------------

/**
 * Determine the current stroke phase from successive landmark frames.
 *
 * Heuristics used (all based on 2D normalised coordinates):
 *  - wrist height vs. shoulder height  → preparation vs. backswing / contact
 *  - wrist vertical velocity           → rising = backswing loading; peak/falling = contact
 *  - elbow angle trajectory            → falling = backswing; rising = forward_swing
 */
export function detectPhase(
  landmarks: Landmark[],
  previousLandmarks: Landmark[] | null,
  racketHand: RacketHand,
): Phase {
  const wristIdx    = racketHand === 'right' ? RIGHT_WRIST    : LEFT_WRIST;
  const shoulderIdx = racketHand === 'right' ? RIGHT_SHOULDER : LEFT_SHOULDER;
  const elbowIdx    = racketHand === 'right' ? RIGHT_ELBOW    : LEFT_ELBOW;

  const wrist    = landmarks[wristIdx];
  const shoulder = landmarks[shoulderIdx];
  const elbow    = landmarks[elbowIdx];

  if (!isVisible(wrist) || !isVisible(shoulder)) return 'idle';

  // In MediaPipe, y increases downward in normalised coords.
  // wrist.y < shoulder.y  →  wrist is ABOVE shoulder in image coords.
  const wristAboveShoulder = wrist.y < shoulder.y;

  // Frame-to-frame wrist velocity (negative dy = wrist moving up in image)
  let wristDy = 0;
  let elbowAngleDelta = 0;

  if (previousLandmarks) {
    const prevWrist    = previousLandmarks[wristIdx];
    const prevShoulder = previousLandmarks[shoulderIdx];
    const prevElbow    = previousLandmarks[elbowIdx];

    if (isVisible(prevWrist)) {
      wristDy = wrist.y - prevWrist.y; // negative = wrist moved up
    }

    if (
      isVisible(elbow) && isVisible(prevElbow) &&
      isVisible(prevShoulder) && isVisible(prevWrist)
    ) {
      const prevAngle = absAngle3Points(prevShoulder, prevElbow, prevWrist);
      const currAngle = absAngle3Points(shoulder, elbow, wrist);
      elbowAngleDelta = currAngle - prevAngle; // positive = elbow more extended
    }
  }

  // Classification tree
  if (!wristAboveShoulder) {
    // Wrist below shoulder level — preparation or idle
    if (previousLandmarks && Math.abs(wristDy) > 0.005) {
      return 'preparation'; // actively moving into position
    }
    return 'idle';
  }

  // Wrist above shoulder
  if (wristDy < -0.008) {
    // Wrist still rising rapidly
    return 'backswing';
  }

  if (elbowAngleDelta > 2) {
    // Elbow extending (angle growing) — forward swing or contact
    if (wristDy > 0.005) {
      // Wrist now moving downward after peak — follow-through
      return 'follow_through';
    }
    return 'forward_swing';
  }

  if (elbowAngleDelta < -2) {
    // Elbow re-flexing after peak extension — follow-through
    return 'follow_through';
  }

  // Wrist above shoulder, little movement — at or near contact point
  return 'contact';
}

// ---------------------------------------------------------------------------
// Auto shot-type inference
// ---------------------------------------------------------------------------

/**
 * Guess the shot type from wrist trajectory and height.
 * This is a best-effort heuristic; explicit user selection is always preferred.
 */
function inferShotMode(
  landmarks: Landmark[],
  previousLandmarks: Landmark[] | null,
  racketHand: RacketHand,
): Exclude<ShotMode, 'auto'> {
  const wristIdx    = racketHand === 'right' ? RIGHT_WRIST    : LEFT_WRIST;
  const shoulderIdx = racketHand === 'right' ? RIGHT_SHOULDER : LEFT_SHOULDER;
  const lAnkle = landmarks[LEFT_ANKLE];
  const rAnkle = landmarks[RIGHT_ANKLE];

  const wrist    = landmarks[wristIdx];
  const shoulder = landmarks[shoulderIdx];

  // If neither wrist nor shoulder is visible, fall back to smash as default
  if (!isVisible(wrist) || !isVisible(shoulder)) return 'smash';

  // Net shot: wrist is relatively low AND there is a visible lunge (wide ankle spread)
  if (isVisible(lAnkle) && isVisible(rAnkle)) {
    const ankleSpread = Math.abs(lAnkle.x - rAnkle.x);
    const isLunging   = ankleSpread > 0.35; // rough normalised threshold
    if (isLunging && wrist.y >= shoulder.y) {
      return 'net';
    }
  }

  // If wrist goes well above shoulder, assume overhead shot
  if (wrist.y < shoulder.y) {
    if (previousLandmarks) {
      const prevWrist = previousLandmarks[wristIdx];
      if (isVisible(prevWrist)) {
        const speed = Math.abs(wrist.y - prevWrist.y) + Math.abs(wrist.x - prevWrist.x);
        if (speed > 0.04) return 'smash';
        if (speed > 0.02) return 'clear';
        return 'drop';
      }
    }
    return 'smash';
  }

  return 'smash';
}

// ---------------------------------------------------------------------------
// Reference-based rule evaluation
// ---------------------------------------------------------------------------

interface Issue {
  message: string;
  severity: Severity;
  joints: number[];
}

function evaluatePhaseAngles(
  ref: PostureReference,
  phase: Phase,
  elbowAngle: number | null,
  racketHand: RacketHand,
): Issue[] {
  const phaseRef = ref.phases[phase];
  if (!phaseRef || elbowAngle === null) return [];

  const issues: Issue[] = [];
  const { min, max } = phaseRef.racketElbow;

  const elbowJoints = racketHand === 'right'
    ? [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST]
    : [LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST];

  if (elbowAngle < min - ANGLE_TOLERANCE) {
    issues.push({
      message: `${ref.name} ${phase}: elbow too bent (${Math.round(elbowAngle)}° — aim for ${min}–${max}°)`,
      severity: 'warning',
      joints: elbowJoints,
    });
  } else if (elbowAngle > max + ANGLE_TOLERANCE) {
    issues.push({
      message: `${ref.name} ${phase}: elbow too extended (${Math.round(elbowAngle)}° — aim for ${min}–${max}°)`,
      severity: 'warning',
      joints: elbowJoints,
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute coaching feedback from a pose landmarks array.
 *
 * @param landmarks         Current smoothed MediaPipe landmarks.
 * @param racketHand        Which hand holds the racket.
 * @param shotMode          Which shot the player is practising (or 'auto' to infer).
 * @param previousLandmarks Previous frame's smoothed landmarks for velocity computation.
 * @param calibration       Optional calibration baseline for personalised thresholds.
 * @param cameraAngle       Camera orientation — affects lunge foot-forward heuristic.
 */
export function computeFeedback(
  landmarks: Landmark[],
  racketHand: RacketHand = 'right',
  shotMode: ShotMode = 'auto',
  previousLandmarks: Landmark[] | null = null,
  calibration: CalibrationData | null = null,
  cameraAngle: CameraAngle = 'front',
): FeedbackResult {
  const metrics = {
    leftElbowAngle:   null as number | null,
    rightElbowAngle:  null as number | null,
    leftKneeAngle:    null as number | null,
    rightKneeAngle:   null as number | null,
    stanceWidthRatio: null as number | null,
  };

  // Check key landmarks are visible
  const keyIndices = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP];
  const anyKeyVisible = keyIndices.some((i) => isVisible(landmarks[i]));

  if (!anyKeyVisible || landmarks.length < 29) {
    return {
      message: 'No person detected – move closer',
      severity: 'error',
      details: metrics,
      problemJoints: [],
    };
  }

  // Extract landmark references
  const lShoulder = landmarks[LEFT_SHOULDER];
  const rShoulder = landmarks[RIGHT_SHOULDER];
  const lElbow    = landmarks[LEFT_ELBOW];
  const rElbow    = landmarks[RIGHT_ELBOW];
  const lWrist    = landmarks[LEFT_WRIST];
  const rWrist    = landmarks[RIGHT_WRIST];
  const lHip      = landmarks[LEFT_HIP];
  const rHip      = landmarks[RIGHT_HIP];
  const lKnee     = landmarks[LEFT_KNEE];
  const rKnee     = landmarks[RIGHT_KNEE];
  const lAnkle    = landmarks[LEFT_ANKLE];
  const rAnkle    = landmarks[RIGHT_ANKLE];

  // Compute elbow angles (absolute, unsigned — good for range checks)
  if (isVisible(lShoulder) && isVisible(lElbow) && isVisible(lWrist)) {
    metrics.leftElbowAngle = absAngle3Points(lShoulder, lElbow, lWrist);
  }
  if (isVisible(rShoulder) && isVisible(rElbow) && isVisible(rWrist)) {
    metrics.rightElbowAngle = absAngle3Points(rShoulder, rElbow, rWrist);
  }

  // Compute knee angles (absolute)
  if (isVisible(lHip) && isVisible(lKnee) && isVisible(lAnkle)) {
    metrics.leftKneeAngle = absAngle3Points(lHip, lKnee, lAnkle);
  }
  if (isVisible(rHip) && isVisible(rKnee) && isVisible(rAnkle)) {
    metrics.rightKneeAngle = absAngle3Points(rHip, rKnee, rAnkle);
  }

  // Stance width ratio: ankle distance / hip-to-ankle height
  if (isVisible(lAnkle) && isVisible(rAnkle) && isVisible(lHip) && isVisible(rHip)) {
    const ankleDistance = landmarkDistance(lAnkle, rAnkle);
    const hipY    = (lHip.y + rHip.y) / 2;
    const ankleY  = (lAnkle.y + rAnkle.y) / 2;
    const hipHeight = Math.abs(ankleY - hipY);
    if (hipHeight > 0.01) {
      metrics.stanceWidthRatio = ankleDistance / hipHeight;
    }
  }

  // ---------------------------------------------------------------------------
  // Calibration — derive personalised thresholds when available
  // ---------------------------------------------------------------------------
  let calibratedMinKneeFlexion = 140; // default ready-position threshold
  let calibratedMaxStanceWidth = 1.4;
  let calibratedMinStanceWidth = 0.8;

  if (calibration) {
    const cal = calibration.landmarks;
    const calLHip   = cal[LEFT_HIP];
    const calRHip   = cal[RIGHT_HIP];
    const calLKnee  = cal[LEFT_KNEE];
    const calRKnee  = cal[RIGHT_KNEE];
    const calLAnkle = cal[LEFT_ANKLE];
    const calRAnkle = cal[RIGHT_ANKLE];

    // Personalised knee flexion neutral: calibrated angle − 20° as minimum
    let calKneeSum   = 0;
    let calKneeCount = 0;
    if (isVisible(calLHip) && isVisible(calLKnee) && isVisible(calLAnkle)) {
      calKneeSum += absAngle3Points(calLHip, calLKnee, calLAnkle);
      calKneeCount++;
    }
    if (isVisible(calRHip) && isVisible(calRKnee) && isVisible(calRAnkle)) {
      calKneeSum += absAngle3Points(calRHip, calRKnee, calRAnkle);
      calKneeCount++;
    }
    if (calKneeCount > 0) {
      const calKneeNeutral = calKneeSum / calKneeCount;
      calibratedMinKneeFlexion = calKneeNeutral - 20;
    }

    // Personalised stance width: calibrated ratio ± 30 %
    if (
      isVisible(calLAnkle) && isVisible(calRAnkle) &&
      isVisible(calLHip)   && isVisible(calRHip)
    ) {
      const calAnkleDist = landmarkDistance(calLAnkle, calRAnkle);
      const calHipH = Math.abs(
        (calLAnkle.y + calRAnkle.y) / 2 - (calLHip.y + calRHip.y) / 2,
      );
      if (calHipH > 0.01) {
        const calWidthRatio      = calAnkleDist / calHipH;
        calibratedMinStanceWidth = calWidthRatio * 0.7;
        calibratedMaxStanceWidth = calWidthRatio * 1.5;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase & shot-mode resolution
  // ---------------------------------------------------------------------------
  const phase = detectPhase(landmarks, previousLandmarks, racketHand);

  const resolvedMode: Exclude<ShotMode, 'auto'> =
    shotMode === 'auto'
      ? inferShotMode(landmarks, previousLandmarks, racketHand)
      : shotMode;

  const ref: PostureReference | undefined = SHOT_REFERENCE[resolvedMode];

  // ---------------------------------------------------------------------------
  // Evaluate rules — collect candidates
  // ---------------------------------------------------------------------------
  const issues: Issue[] = [];

  const elbowAngle =
    racketHand === 'right' ? metrics.rightElbowAngle : metrics.leftElbowAngle;

  // --- Shot-specific elbow angle check (replaces generic 130/170 thresholds) ---
  if (ref && phase !== 'idle') {
    issues.push(...evaluatePhaseAngles(ref, phase, elbowAngle, racketHand));
  } else if (elbowAngle !== null) {
    // Fallback generic elbow check when no reference applies
    if (elbowAngle < 100) {
      issues.push({
        message: 'Elbow too bent — check your stroke preparation',
        severity: 'warning',
        joints: racketHand === 'right'
          ? [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST]
          : [LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST],
      });
    } else if (elbowAngle > 175) {
      issues.push({
        message: 'Elbow fully locked — keep a slight bend for control',
        severity: 'warning',
        joints: racketHand === 'right'
          ? [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST]
          : [LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST],
      });
    }
  }

  // --- Lunge / front-knee check ---
  // Determine which foot is forward based on camera angle.
  if (isVisible(lAnkle) && isVisible(rAnkle)) {
    let leftIsForward: boolean;

    if (cameraAngle === 'side') {
      // Side-view: use X coordinates — lower X = further left in frame
      leftIsForward = lAnkle.x < rAnkle.x;
    } else {
      // Front-view: use Y coordinates but resolve ties with hip displacement
      if (Math.abs(lAnkle.y - rAnkle.y) > 0.02) {
        leftIsForward = lAnkle.y < rAnkle.y;
      } else {
        // Tie-breaker: whichever hip is displaced further forward (lower y)
        const hipDisplacementLeft  = isVisible(lHip) ? lHip.y : 1;
        const hipDisplacementRight = isVisible(rHip) ? rHip.y : 1;
        leftIsForward = hipDisplacementLeft < hipDisplacementRight;
      }
    }

    const frontKneeAngle  = leftIsForward ? metrics.leftKneeAngle  : metrics.rightKneeAngle;
    const frontKneeJoints = leftIsForward
      ? [LEFT_HIP, LEFT_KNEE, LEFT_ANKLE]
      : [RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE];

    if (frontKneeAngle !== null && frontKneeAngle < 100) {
      issues.push({
        message: 'Too shallow lunge – bend front knee more',
        severity: 'warning',
        joints: frontKneeJoints,
      });
    }
  }

  // --- Stance width check (calibration-aware) ---
  if (metrics.stanceWidthRatio !== null) {
    const stanceJoints = [LEFT_ANKLE, RIGHT_ANKLE, LEFT_HIP, RIGHT_HIP];
    if (metrics.stanceWidthRatio < calibratedMinStanceWidth) {
      issues.push({
        message: 'Stance too narrow – widen your feet',
        severity: 'warning',
        joints: stanceJoints,
      });
    } else if (metrics.stanceWidthRatio > calibratedMaxStanceWidth) {
      issues.push({
        message: 'Stance too wide – bring feet closer',
        severity: 'warning',
        joints: stanceJoints,
      });
    }
  }

  // --- Knee flexion check (calibration-aware) ---
  if (metrics.leftKneeAngle !== null && metrics.rightKneeAngle !== null) {
    const avgKnee = (metrics.leftKneeAngle + metrics.rightKneeAngle) / 2;
    if (avgKnee > calibratedMinKneeFlexion + 30) {
      issues.push({
        message: 'Knees too straight – stay lower and ready to move',
        severity: 'warning',
        joints: [LEFT_HIP, LEFT_KNEE, LEFT_ANKLE, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE],
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Prioritise issues: error > warning, then pick first
  // ---------------------------------------------------------------------------
  const errorIssue = issues.find((i) => i.severity === 'error');
  if (errorIssue) {
    return {
      message:      errorIssue.message,
      severity:     errorIssue.severity,
      details:      metrics,
      problemJoints: errorIssue.joints,
    };
  }

  const warningIssue = issues.find((i) => i.severity === 'warning');
  if (warningIssue) {
    return {
      message:      warningIssue.message,
      severity:     warningIssue.severity,
      details:      metrics,
      problemJoints: warningIssue.joints,
    };
  }

  return {
    message:      'Good stance – keep it up!',
    severity:     'good',
    details:      metrics,
    problemJoints: [],
  };
}
