/** A single landmark from MediaPipe (image: 0–1, world: metres). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type Hand = 'left' | 'right';
export type DrillMode = 'smash' | 'clear' | 'drop' | 'net' | 'ready';
export type Status = 'good' | 'warn' | 'bad' | 'na';
export type BodyPart = 'legs' | 'weight' | 'trunk' | 'shoulder' | 'elbow' | 'wrist';
export type Phase = 'idle' | 'ready' | 'loading' | 'swing' | 'follow';

export interface Check {
  id: string;
  part: BodyPart;
  label: string;
  value: string;
  target: string;
  status: Status;
  tip?: string;
}

/** Joint angles and body measurements for one frame (3D, from world landmarks). */
export interface FrameMetrics {
  kneeRacket: number | null;
  kneeOther: number | null;
  elbow: number | null;
  /** Angle between upper arm and trunk; 0 = arm down by your side, 180 = straight up. */
  shoulderElev: number | null;
  /** Elbow height above the racket shoulder, metres (negative = below). */
  elbowAboveShoulder: number | null;
  /** Wrist height above the head (nose), metres. */
  wristAboveHead: number | null;
  otherWristAboveShoulder: number | null;
  /** Forward/back lean of the trunk from vertical, degrees. */
  trunkLean: number | null;
  /** Direction of the shoulder line / hip line in the floor plane, degrees. */
  shoulderYaw: number | null;
  hipYaw: number | null;
  /** Shoulder–hip separation ("X-factor"), degrees. */
  xFactor: number | null;
  /** Feet distance / shoulder width. */
  stance: number | null;
  /** 0 = all weight on the non-racket foot, 1 = all on the racket-side foot. */
  weightRacketFoot: number | null;
  /** How far the racket-side knee is ahead of its toes (metres, positive = past the toes). */
  kneePastToe: number | null;
  /** Racket wrist speed relative to the hips, m/s. */
  wristSpeed: number | null;
}

export interface SequencePeak {
  part: 'hips' | 'shoulders' | 'elbow' | 'wrist';
  label: string;
  /** Time of the peak relative to contact (ms, negative = before). */
  tMs: number | null;
  /** Peak value (deg/s or m/s). */
  peak: number | null;
  unit: string;
}

export interface SwingReport {
  id: number;
  mode: DrillMode;
  at: number;
  score: number;
  checks: Check[];
  sequence: SequencePeak[];
  sequenceOk: boolean;
  /** Short time series for the timeline chart (ms relative to contact, normalised 0–1). */
  curves: Record<SequencePeak['part'], Array<[number, number]>>;
}
