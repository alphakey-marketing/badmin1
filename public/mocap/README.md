# 真人動作捕捉數據 (motion capture)

The demo page plays real players' motion from this folder when it exists.
Files here use the `badmin1-mocap-v1` format (21 joints, metres, y up, swing towards +x).

## Import MultiSenseBadminton (forehand clear + backhand drive)

Dataset: Seong et al. (2024), *MultiSenseBadminton: Wearable Sensor–Based Biomechanical Dataset for
Evaluation of Badminton Performance*, Scientific Data. Licence **CC BY 4.0** (credit the authors).
25 players (12 novice, 8 intermediate, 5 expert), Perception Neuron Studio IMU suit.

1. Download the HDF5 files from figshare: https://doi.org/10.6084/m9.figshare.c.6725706.v1
2. Pick the expert players' files (skill levels are in the dataset's annotation sheet).
3. Run:

   ```bash
   pip install h5py numpy
   python scripts/mocap/extract_multisense.py --skill expert --out public/mocap path/to/SubXX/*.hdf5 path/to/SubYY/*.hdf5
   ```

   This writes `clear.json`, `backhandDrive.json` (the most typical stroke of all those passed in) and `index.json`.
4. Commit the files. The demo page shows a **真人動作捕捉** button for those moves, plus real-vs-demo angle checks.

## Record your own

In the 動作教練 tab, open a camera or a video and press **⏺ 錄製動作**. A `.json` file in the same format is
downloaded; open it in 示範動作 → **載入動作檔**. Only record people who agreed to it.

## Notes

- The suit records body joints only: racket direction and toes are estimated in the app.
- Contact time = peak speed of the racket hand relative to the hips.
