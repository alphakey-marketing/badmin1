# badmin1 – 羽毛球動作 × 物理實驗室

A web app with two parts:

1. **動作教練 (Motion coach)** – reads your whole-body movement from the camera or an uploaded clip and checks it against reference angles for each stroke, including the **kinetic chain** (hips → shoulders → elbow → wrist).
2. **3D 旋轉物理 (Shuttle physics lab)** – a 3D shuttlecock flight simulator that shows how **spin** changes the aerodynamics: turnover (flip), gyroscopic stability, spin drift and extra drag.

Everything runs in the browser. No video is uploaded anywhere.

## 動作教練 – Motion coach

- Camera (front/back) or **video upload**. Phone slow-motion clips (60–240 fps) work best for fast strokes; set the slow-motion factor so speeds are computed in real time.
- Uses MediaPipe Pose **world landmarks** (3D, metres), so angles don't depend much on camera angle.
- Drill modes: 殺球 smash, 高遠球 clear, 吊球 drop, 網前弓步 net lunge, 準備姿勢 ready stance.
- **Live checks** per body part (legs, weight, trunk/rotation, shoulder, elbow, wrist): knee bend, stance width, weight over which foot, trunk lean, elbow height, elbow angle, non-racket arm, knee past toes.
- **Swing report**: when the racket wrist reaches a speed peak, the last ~0.8 s is analysed:
  - Kinetic chain order: time of peak hip rotation, shoulder rotation, elbow extension and wrist speed.
  - Hip/shoulder rotation range, weight transfer from back to front foot, knee loading, elbow angle at backswing and contact, contact height.
  - Score (the kinetic-chain order counts double).
- Colour-coded skeleton on the video plus a **rotatable 3D skeleton**.

Reference angles live in `src/data/badmintonReferenceAngles.ts`.

## 3D 旋轉物理 – Shuttle physics lab

A 6-degree-of-freedom rigid-body model (`src/physics/shuttleSim.ts`):

- Drag `½ρC_dAv²` (terminal velocity ≈ 6 m/s), higher when the shuttle is tilted.
- Turnover after impact (cork starts facing the racket) – about 24 ms for a 70 m/s smash.
- Restoring torque from the centre of pressure sitting behind the centre of mass.
- Feather "turbine" spin proportional to speed; gyroscopic coupling; spin opens the skirt (more drag); small Magnus-like side force when tilted.
- Feather vs nylon shuttles (nylon spins less, skirt squeezes at high speed).

The UI has shot presets (smash, clear, drop, slice drop, tumbling net shot, lift), sliders for launch conditions and spin, slow-motion playback down to 1/50×, a real-size close-up of the spinning shuttle, force arrows, a dashed "no spin" comparison path, charts (speed, tilt angle, spin rate) and step-by-step explanations in Cantonese.

It is a simplified teaching model with rounded coefficients from published studies, not lab-grade data.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in Chrome or Edge and allow camera access. Add `#lab` to the URL to open the physics lab directly.

```bash
npm run build
```

## Project layout

```
src/
  App.tsx                 tabs: coach / lab
  coach/                  camera + pose + analysis
    useVideoSource.ts     camera or uploaded video
    usePose.ts            MediaPipe Pose Landmarker (image + world landmarks)
    analysis.ts           metrics, live checks, swing / kinetic-chain analysis
    PoseOverlay.tsx       2D skeleton on the video
    Skeleton3D.tsx        rotatable 3D skeleton (three.js)
    ChainTimeline.tsx     kinetic-chain timing chart
  physics/
    shuttleSim.ts         flight + spin simulator
    shuttleModel.ts       3D shuttlecock mesh
    ShuttleScene.ts       three.js court, path, forces, close-up view
    ShuttleLab.tsx        lab UI
    PhysicsExplainer.tsx  Cantonese explanations
  data/badmintonReferenceAngles.ts
```
