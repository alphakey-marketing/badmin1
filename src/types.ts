/** A single 3D landmark from MediaPipe */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** Severity levels for feedback */
export type Severity = 'good' | 'warning' | 'error';

/** Racket hand preference */
export type RacketHand = 'left' | 'right';

/** Debug metrics computed from pose */
export interface PoseMetrics {
  leftElbowAngle: number | null;
  rightElbowAngle: number | null;
  leftKneeAngle: number | null;
  rightKneeAngle: number | null;
  stanceWidthRatio: number | null;
}

/** Feedback result from the feedback engine */
export interface FeedbackResult {
  message: string;
  severity: Severity;
  details: PoseMetrics;
}

/** Calibration baseline pose */
export interface CalibrationData {
  landmarks: Landmark[];
  timestamp: number;
}
