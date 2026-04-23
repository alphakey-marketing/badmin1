Now I have read the entire codebase. Here is a complete design-and-engineering improvement roadmap, grounded specifically in what is already in [alphakey-marketing/badmin1](https://github.com/alphakey-marketing/badmin1). 

***

## Badminton App — Improvement Design Roadmap

This roadmap is split into four improvement waves. Each wave builds on the last, and every task is tied to a **specific file or gap** that already exists in the repo. 

***

## Wave 1 — Fix the Feedback Brain
*Goal: Make the coaching output actually correct. No new features — only make what exists work properly.*

This is the most urgent wave because the current `feedbackEngine.ts` uses generic, context-free thresholds that fire regardless of what the player is doing.  Until the engine knows what "correct" looks like per shot and per phase, every other improvement is cosmetic.

### 1.1 Add `badmintonReferenceAngles.ts`

Create a new file `src/utils/badmintonReferenceAngles.ts` containing the full reference table (smash, clear, drop, net shot, ready position, lunge) with angle ranges per shot phase, as studied from Lin Dan / Lee Chong Wei biomechanics.  This file has no code logic — it is purely data. Every other feedback rule should **import from here** instead of hardcoding numbers. [scribd](https://www.scribd.com/document/968241161/4910-Other-20616-2-2-20251008)

### 1.2 Replace `Math.acos` with Signed `Math.atan2` Angles

In `poseUtils.ts`, `angle3Points` currently returns unsigned angles (0–180°) because it uses `Math.acos`.  This means the app cannot detect whether an elbow is bending forward or backward, which is critical for phase detection. Replace with:

```ts
export function angle3Points(p1: Landmark, p2: Landmark, p3: Landmark): number {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  return Math.atan2(cross, dot) * 180 / Math.PI;
}
```

Add a companion `absAngle3Points` wrapper using `Math.abs()` for cases where direction does not matter (stance width, etc.). 

### 1.3 Add Phase Detection to `feedbackEngine.ts`

Add a `detectPhase()` function that classifies the current frame as one of: `idle`, `preparation`, `backswing`, `forward_swing`, `contact`, `follow_through`.  Phase is detected using:

- **Velocity** of the racket wrist landmark between the previous and current frame — sharp upward then forward acceleration = `forward_swing` → `contact`
- **Elbow angle trajectory** — falling angle = `backswing` loading; rising = `forward_swing`
- **Wrist height vs. shoulder height** — wrist below shoulder = `preparation`; wrist above = `backswing` or `contact`

Store the previous frame's landmarks (already smoothed) and compute per-frame delta. This requires passing `previousLandmarks` into `computeFeedback()`, which means updating the function signature in `feedbackEngine.ts`. 

### 1.4 Add Shot-Mode Selector to UI

Add a `shotMode` state to `App.tsx` with values: `'smash' | 'clear' | 'drop' | 'net' | 'auto'`.  Pass it into `computeFeedback()`. Each mode loads the corresponding reference from `badmintonReferenceAngles.ts` and compares the live angles against the right targets for each phase. In `auto` mode, the app guesses the shot type from the wrist trajectory. This is **the single most impactful UX change** — the player can say "I am practicing smash" and get smash-specific coaching.

### 1.5 Wire Calibration into the Engine

`App.tsx` captures `CalibrationData` but never passes it to `computeFeedback()`.  Update the engine to:
- Accept optional `calibration: CalibrationData | null`
- If calibration exists, use calibrated neutral angles as personalized baselines for stanceWidth and kneeFlexion thresholds instead of the generic defaults

### 1.6 Fix the Lunge Heuristic

The front-knee detection uses `lAnkle.y < rAnkle.y` to guess which foot is forward.  This is wrong for side-view cameras. Replace with:

- If camera mode = `'side'`: use X coordinates instead of Y (`lAnkle.x < rAnkle.x`)
- If camera mode = `'front'`: keep Y but use hip-displacement direction as a tie-breaker
- Add a `cameraAngle: 'front' | 'side'` state to `App.tsx` and pass it into the engine

### 1.7 Move `problemJoints` into `FeedbackResult`

In `App.tsx`, `getProblemJoints()` parses the message string to decide which joints to highlight.  This is fragile. Instead:

- Add `problemJoints: number[]` to the `FeedbackResult` interface in `types.ts` 
- Set it directly inside `computeFeedback()` when a rule fires
- Remove `getProblemJoints()` from `App.tsx` entirely

***

## Wave 2 — Richer Feedback Display
*Goal: Make the UI communicate coaching intent, not just pass/fail labels.*

The current `FeedbackDisplay` shows one short message in a coloured pill.  That is fine for MVP, but it does not teach anything. Wave 2 expands the visual language of coaching.

### 2.1 Add a `coachingNote` Field to `FeedbackResult`

Update `types.ts` to add: 

```ts
export interface FeedbackResult {
  message: string;          // short alert: "Elbow too low"
  coachingNote?: string;    // why + what to do: from badmintonReferenceAngles.ts
  severity: Severity;
  details: PoseMetrics;
  problemJoints: number[];
  detectedPhase?: Phase;
  detectedShot?: ShotMode;
}
```

`FeedbackDisplay.tsx` then shows `message` prominently and `coachingNote` as a smaller sub-line when expanded. 

### 2.2 Expandable Feedback Panel

Replace the single-line pill in `FeedbackDisplay.tsx` with a two-state component: 

- **Collapsed** (default during motion): shows icon + short message only
- **Expanded** (tap to open, or auto-opens when player is idle): shows short message + coaching note + current measured angle vs. target range

This prevents visual distraction during actual play while making the reasoning visible when the player pauses.

### 2.3 Multiple Concurrent Feedback Items

The engine currently returns only one message using a simple priority chain.  Update `FeedbackResult` to:

```ts
issues: Array<{ message: string; severity: Severity; joint: number[] }>;
primaryIssue: FeedbackItem; // highest priority
```

`FeedbackDisplay` shows the primary issue prominently and lists secondary issues in smaller text below. Cap at 2 secondary items to avoid overload.

### 2.4 Skeleton Highlight Improvements in `SkeletonOverlay`

Currently, joints are highlighted by looking up the `problemJoints` set.  Extend this to:

- Draw a **pulsing ring** (animated CSS or canvas) around the specific problem joint (e.g., elbow) rather than just colouring it red
- Draw an **angle arc** on the skeleton at the flagged joint — show the current angle value as a small number next to the arc
- Draw a **target-range arc** in a dimmer colour alongside the live angle so the player can see how far off they are

### 2.5 Phase Indicator HUD

Add a small horizontal phase bar at the top (or side) of the screen showing: `PREP → BACKSWING → SWING → CONTACT → FOLLOW`. Highlight the currently detected phase. This helps the player understand what the app is "watching" at any moment and builds trust that the system is working correctly.

### 2.6 Shot Mode Badge

Display the currently active shot mode (e.g., "🏸 SMASH mode") as a persistent small badge near the camera controls. Tapping it opens a shot-mode selector drawer without leaving the live feed.

***

## Wave 3 — Movement Intelligence
*Goal: The app understands movement sequences, not just single frames.*

### 3.1 Velocity and Acceleration Tracking

Add a `MotionTracker` class that maintains a rolling window of the last N frames of key landmarks (wrist, elbow, hip, ankle).  Compute:

- Wrist velocity (pixels/frame) — used to detect swing start and contact
- Hip lateral displacement — used to detect lunge direction
- Ankle vertical displacement — used to detect split-step timing

Store this in a new `src/utils/motionTracker.ts` file. Feed it from the main `requestAnimationFrame` loop in the pose hook.

### 3.2 Swing Event Detection

Using `MotionTracker`, detect discrete swing events:

- **Swing start**: wrist velocity exceeds threshold AND elbow angle begins decreasing
- **Contact window**: wrist velocity peaks (fastest point in the swing)
- **Recovery**: wrist decelerates and returns below shoulder

Fire feedback events specifically at these windows rather than every frame. This produces much sharper, more relevant coaching messages (e.g., "elbow too low *at contact*" instead of "elbow too low" during a resting stance).

### 3.3 Split-Step Detector

Using ankle vertical displacement, detect when the player performs a split-step: [pmc.ncbi.nlm.nih](https://pmc.ncbi.nlm.nih.gov/articles/PMC11117488/)

- Both ankles rise and then fall simultaneously
- Time window: within ~300–500ms of opponent's stroke
- Check: knee angle immediately after landing should be < 140°

Give positive feedback for a good split-step: "Good split step ✓". Flag late or missing split-steps.

### 3.4 Recovery Tracking

After a lunge is detected (sharp hip displacement + deep knee angle), track how long the player takes to return to a balanced base stance. Compare against typical elite recovery times (~0.8–1.2 seconds).  Give feedback: "Recovery slow — return to center faster." [pmc.ncbi.nlm.nih](https://pmc.ncbi.nlm.nih.gov/articles/PMC6348812/)

### 3.5 Camera Angle Calibration Wizard

Add a one-time guided setup flow when the user first opens the app (or resets calibration): 

1. "Stand side-on to the camera" → app checks that shoulder landmarks are significantly offset in X (confirms side view)
2. "Stand front-on to the camera" → app checks that shoulder X values are close (confirms front view)
3. Record the detected camera angle automatically → set `cameraAngle` state
4. Show recommended frame adjustments if the player is too close, too far, or partially occluded

This removes the need for the player to manually tell the app the camera angle.

***

## Wave 4 — Session Memory and Drill Mode
*Goal: The app becomes a coach across sessions, not just a live sensor.*

### 4.1 Session Logging to `localStorage`

After each practice session, save a summary to `localStorage`:

```ts
interface SessionSummary {
  id: string;
  timestamp: number;
  shotMode: ShotMode;
  duration: number;       // seconds
  swingCount: number;
  issueFrequency: Record<string, number>; // message → count
  avgElbowAngleAtContact: number | null;
  avgKneeFlexion: number | null;
  goodFrameRatio: number; // % of frames rated "good"
}
```

No backend needed — purely local storage for now.

### 4.2 Progress Dashboard Screen

Add a second screen (`/history`) accessible from a button in the main UI. Display:

- Line chart of average elbow angle at contact across sessions
- Line chart of good-frame ratio over time
- Most frequent issue per week
- "Streak" of sessions with improving scores

Use a lightweight chart library (Recharts works well with React).

### 4.3 Drill Mode

Add a `DrillMode` component with preset movement exercises:

| Drill | What it checks |
|---|---|
| Smash preparation drill | Correct backswing elbow angle 10 consecutive reps |
| Six-point footwork | Lunge depth and recovery speed to six court zones |
| Split-step timing | Detect split step before each simulated shot |
| Deceptive drop disguise | Preparation angle must match smash shape until contact |

Each drill has a **target count**, **score per rep**, and a **completion screen** with summary.

### 4.4 Export / Share

Let the player export a session summary as a PNG card (shareable to Xiaohongshu / Little Red Book — relevant given your content creation focus).  Include: session date, shot mode, top issue, improvement score vs. last session.

***

## Summary: File Change Map

| File | Wave | What Changes |
|---|---|---|
| `src/utils/poseUtils.ts` | 1 | Signed `atan2` angle, new `absAngle3Points` |
| `src/utils/feedbackEngine.ts` | 1 | Phase detection, shot-mode routing, calibration wiring, `problemJoints` in result |
| `src/utils/badmintonReferenceAngles.ts` | 1 | **New file** — full biomechanics reference table |
| `src/utils/motionTracker.ts` | 3 | **New file** — velocity/event tracker |
| `src/types.ts` | 1/2 | Expanded `FeedbackResult`, new `Phase`, `ShotMode` types |
| `src/App.tsx` | 1/2 | `shotMode` state, `cameraAngle` state, calibration passed to engine |
| `src/components/FeedbackDisplay.tsx` | 2 | Expandable panel, coaching note, secondary issues |
| `src/components/SkeletonOverlay.tsx` | 2 | Angle arcs, pulsing joints, target-range overlay |
| `src/components/PhaseIndicator.tsx` | 2 | **New component** — phase HUD bar |
| `src/components/ShotModeSelector.tsx` | 2 | **New component** — shot mode drawer |
| `src/components/DrillMode.tsx` | 4 | **New component** — drill exercises |
| `src/components/SessionDashboard.tsx` | 4 | **New component** — history + charts |
| `src/hooks/useSession.ts` | 4 | **New hook** — session logging to localStorage |

The most impactful single change you can make right now is **Wave 1.4 (shot mode selector) + Wave 1.1 (reference angle table)**. Those two together will transform the feedback from generic noise into sport-specific coaching — and they do not require any new ML or backend work.
