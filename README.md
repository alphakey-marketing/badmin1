# badmin1 – Badminton Movement Feedback MVP

A **web-based app** that gives you **instant, visual + text feedback** about your badminton movement and stance while you stand in front of your camera.

## Features

- 🎥 **Live camera input** – front and rear camera support via `getUserMedia`
- 🦴 **Skeleton overlay** – real-time MediaPipe Pose Landmarker (33 body landmarks) drawn as a canvas overlay
- 🟩🟨🟥 **Color-coded feedback** – instant movement hints:
  - Elbow too low / straight – bend elbow more for snap
  - Elbow raised too early
  - Too shallow lunge – bend front knee more
  - Stance too narrow / too wide
  - No person detected – move closer
- 🔬 **Debug panel** – live metrics (elbow/knee angles, stance ratio, FPS)
- 🎯 **Calibration** – record a neutral stance as a baseline
- 📷 **Camera setup guide** – tips for distance, angle, and lighting

## Tech Stack

- **Vite + React + TypeScript**
- **MediaPipe Pose Landmarker** (WebAssembly, runs entirely in-browser)
- HTML `<video>` + `<canvas>` overlay
- No backend required – all processing is on-device

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in Chrome or Edge.  
Allow camera permissions when prompted.

## Build

```bash
npm run build
```

## Architecture

```
Camera → Video element → requestAnimationFrame loop → MediaPipe → Landmarks → Metrics + Feedback → UI
```

1. `getUserMedia` → set `video.srcObject`
2. `requestAnimationFrame` loop:
   - `poseLandmarker.detectForVideo(video, timestamp)` → `results.poseLandmarks`
3. Normalize coordinates by canvas width/height
4. Compute joint angles (elbow, knee, shoulder) and stance width
5. Apply feedback rules → severity-coded message
6. Draw skeleton lines + joints on canvas overlay
