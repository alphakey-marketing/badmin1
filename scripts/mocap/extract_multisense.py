#!/usr/bin/env python3
"""
Turn MultiSenseBadminton motion-capture recordings into clips the demo can play.

Dataset: Seong et al. (2024) "MultiSenseBadminton: Wearable Sensor-Based Biomechanical Dataset
for Evaluation of Badminton Performance", Scientific Data. Licence: CC0 on figshare (the paper states CC BY 4.0); please credit the authors.
Download (figshare): https://doi.org/10.6084/m9.figshare.c.6725706.v1

The body data comes from Perception Neuron Studio (IMU suit): 21 joints, global position in cm, y up.
Strokes recorded: "Overhead Clear" (forehand clear) and "Backhand Driving" (backhand drive).

Usage:
    pip install h5py numpy
    python scripts/mocap/extract_multisense.py --skill expert \
        --out public/mocap  path/to/Sub05/*.hdf5  path/to/Sub11/*.hdf5 ...

For each stroke type this writes one clip: the most typical stroke (the medoid, i.e. the one closest
to the average of all the strokes you passed in). Pass only expert players' files for an expert clip;
--skill only labels the output. Use --all to also write every single stroke.
"""
import argparse
import json
import os
import sys

import numpy as np

try:
    import h5py
except ImportError:  # pragma: no cover
    sys.exit("This script needs h5py:  pip install h5py numpy")

JOINTS = [
    "Hips", "Right UpLeg", "Right Leg", "Right Foot", "Left UpLeg", "Left Leg", "Left Foot",
    "Spine", "Spine1", "Spine2", "Neck", "Neck1", "Head",
    "Right Shoulder", "Right Arm", "Right ForeArm", "Right Hand",
    "Left Shoulder", "Left Arm", "Left ForeArm", "Left Hand",
]
J = {n: i for i, n in enumerate(JOINTS)}
STROKES = {"Overhead Clear": "clear", "Backhand Driving": "backhandDrive"}
FPS = 60.0
PAD_BEFORE = 0.25  # seconds kept before the annotated start
PAD_AFTER = 0.25


def text(x):
    if isinstance(x, (bytes, np.bytes_)):
        return x.decode("utf-8", "ignore")
    if isinstance(x, np.ndarray):
        return " ".join(text(v) for v in x.ravel())
    return str(x)


def activity_windows(f):
    """(label, t_start, t_stop) for each annotated swing. Rows come in Start/Stop pairs."""
    acts = f["experiment-activities"]["activities"]
    data = np.array(acts["data"])
    times = np.squeeze(np.array(acts["time_s"])).astype(float)
    rows = [text(r) for r in data]
    out = []
    i = 0
    while i < len(rows) - 1:
        label = next((name for name in STROKES if name in rows[i]), None)
        is_start = "Start" in rows[i] or "Stop" not in rows[i]
        if label and is_start and label in rows[i + 1]:
            out.append((label, times[i], times[i + 1]))
            i += 2
        else:
            i += 1
    return out


def resample(t, frames, fps):
    t_new = np.arange(t[0], t[-1], 1.0 / fps)
    flat = frames.reshape(len(t), -1)
    res = np.stack([np.interp(t_new, t, flat[:, k]) for k in range(flat.shape[1])], axis=1)
    return t_new, res.reshape(len(t_new), -1, 3)


def normalise(clip):
    """Metres, feet on the floor, start over the origin, swing direction along +x."""
    clip = clip / 100.0
    feet = clip[:, [J["Right Foot"], J["Left Foot"]], 1]
    clip[:, :, 1] -= feet.min() - 0.08  # ankle height above the floor
    clip[:, :, 0] -= clip[0, J["Hips"], 0]
    clip[:, :, 2] -= clip[0, J["Hips"], 2]
    # Racket hand = the hand that moves fastest relative to the hips (so running does not count);
    # contact ≈ its speed peak.
    rel = {h: clip[:, J[h]] - clip[:, J["Hips"]] for h in ("Right Hand", "Left Hand")}
    speeds = {h: np.linalg.norm(np.diff(r, axis=0), axis=1) * FPS for h, r in rel.items()}
    hand = max(speeds, key=lambda h: speeds[h].max())
    contact = int(np.argmax(speeds[hand])) + 1
    r = rel[hand]
    d = r[min(contact + 1, len(clip) - 1)] - r[max(contact - 1, 0)]
    yaw = np.arctan2(d[2], d[0])  # rotate this horizontal direction onto +x
    c, s = np.cos(-yaw), np.sin(-yaw)
    x, z = clip[:, :, 0].copy(), clip[:, :, 2].copy()
    clip[:, :, 0] = c * x - s * z
    clip[:, :, 2] = s * x + c * z
    return clip, contact, "right" if hand == "Right Hand" else "left"


def elbow_angle(clip, frame, side):
    a = clip[frame, J[f"{side} Arm"]]
    b = clip[frame, J[f"{side} ForeArm"]]
    c = clip[frame, J[f"{side} Hand"]]
    u, v = a - b, c - b
    return float(np.degrees(np.arccos(np.clip(np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v)), -1, 1))))


def knee_angle(clip, frame, side):
    a = clip[frame, J[f"{side} UpLeg"]]
    b = clip[frame, J[f"{side} Leg"]]
    c = clip[frame, J[f"{side} Foot"]]
    u, v = a - b, c - b
    return float(np.degrees(np.arccos(np.clip(np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v)), -1, 1))))


def extract(path):
    out = []
    with h5py.File(path, "r") as f:
        pos = f["pns-joint"]["global-position"]
        data = np.array(pos["data"], dtype=float)
        t = np.squeeze(np.array(pos["time_s"])).astype(float)
        if data.shape[1] != 63:
            print(f"  skip {path}: expected 63 columns, got {data.shape[1]}")
            return out
        for label, t0, t1 in activity_windows(f):
            m = (t >= t0 - PAD_BEFORE) & (t <= t1 + PAD_AFTER)
            if m.sum() < 10:
                continue
            tt, clip = resample(t[m], data[m].reshape(-1, 21, 3), FPS)
            clip, contact, hand = normalise(clip)
            out.append({"stroke": STROKES[label], "clip": clip, "contact": contact, "hand": hand})
    return out


def medoid(items):
    """Stroke closest to the average (aligned on contact, resampled to a common length)."""
    L = 90
    def norm(it):
        c = it["clip"]
        idx = np.linspace(0, len(c) - 1, L)
        return np.stack([np.interp(idx, np.arange(len(c)), c[:, j, k]) for j in range(21) for k in range(3)], axis=1)
    arr = np.stack([norm(it) for it in items])
    mean = arr.mean(axis=0)
    d = ((arr - mean) ** 2).sum(axis=(1, 2))
    return items[int(np.argmin(d))]


def to_json(item, subject, skill):
    clip = item["clip"]
    side = "Right" if item["hand"] == "right" else "Left"
    other = "Left" if side == "Right" else "Right"
    k = item["contact"]
    load = int(np.argmin([knee_angle(clip, i, side) for i in range(0, k + 1)])) if k > 0 else 0
    return {
        "format": "badmin1-mocap-v1",
        "source": "MultiSenseBadminton (Seong et al., 2024, Scientific Data)",
        "license": "CC0 (figshare record; paper: CC BY 4.0) — please credit Seong et al. 2024",
        "url": "https://doi.org/10.6084/m9.figshare.c.6725706.v1",
        "device": "Perception Neuron Studio (IMU)",
        "stroke": item["stroke"],
        "subject": subject,
        "skill": skill,
        "hand": item["hand"],
        "fps": FPS,
        "contactFrame": k,
        "joints": JOINTS,
        "frames": [[round(float(v), 4) for v in fr.ravel()] for fr in clip],
        "summary": {
            "elbowAtContact": round(elbow_angle(clip, k, side), 1),
            "minRacketSideKneeBeforeContact": round(knee_angle(clip, load, side), 1),
            "minOtherKneeBeforeContact": round(min(knee_angle(clip, i, other) for i in range(0, k + 1)), 1),
        },
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", help="MultiSenseBadminton .hdf5 files")
    ap.add_argument("--out", default="public/mocap")
    ap.add_argument("--skill", default="unknown", help="label for the output, e.g. expert")
    ap.add_argument("--all", action="store_true", help="also write every stroke as its own clip")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    by_stroke = {}
    for path in args.files:
        subject = next((p for p in path.replace("\\", "/").split("/") if p.lower().startswith("sub")), os.path.basename(path))
        items = extract(path)
        print(f"{path}: {len(items)} strokes")
        for it in items:
            it["subject"] = subject
            by_stroke.setdefault(it["stroke"], []).append(it)

    index = []
    for stroke, items in by_stroke.items():
        best = medoid(items)
        doc = to_json(best, best["subject"], args.skill)
        name = f"{stroke}.json"
        with open(os.path.join(args.out, name), "w") as fh:
            json.dump(doc, fh, separators=(",", ":"))
        index.append({"stroke": stroke, "file": name, "subject": best["subject"], "skill": args.skill, "count": len(items), **doc["summary"]})
        print(f"wrote {name}: typical of {len(items)} strokes (from {best['subject']}) {doc['summary']}")
        if args.all:
            for n, it in enumerate(items):
                with open(os.path.join(args.out, f"{stroke}-{it['subject']}-{n:03d}.json"), "w") as fh:
                    json.dump(to_json(it, it["subject"], args.skill), fh, separators=(",", ":"))
    with open(os.path.join(args.out, "index.json"), "w") as fh:
        json.dump(index, fh, indent=2)
    print(f"index: {os.path.join(args.out, 'index.json')}")


if __name__ == "__main__":
    main()
