# badmin1

Badminton Movement Feedback – MVP web app that uses your camera and MediaPipe pose estimation to give real-time feedback on your badminton technique.

## Features

- **Live pose detection** via MediaPipe PoseLandmarker (runs in-browser)
- **Real-time feedback** on elbow angle, knee angle during lunges, and stance width
- **Skeleton overlay** drawn on a canvas, highlighting problem joints in red
- **Debug panel** showing raw metrics (elbow/knee angles, stance ratio, FPS)
- **Front / rear camera** toggle
- **Racket hand** selection (left or right)
- **Calibration** – snapshot a neutral pose as a baseline
- **Camera guide card** with setup tips

## Tech Stack

- Vite + React + TypeScript
- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`)

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
