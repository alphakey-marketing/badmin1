# 戴資穎：16 種動作片段庫

整理日期：2026-11-04。分類沿用 `src/demo/moves.ts`。

全部 16 個動作入口已建立，**8 種有人工查看抽幀畫面嘅片段，另外 8 種待補**。呢個係第一批影片教材，唔係完整 16 種戴資穎動作庫，亦唔係實測 3D 動捕。

## 使用方式

開 app「示範動作 → 戴資穎真人影片」（`#demo`），揀動作，再按「載入呢段影片」。每段有官方來源、起止時間、戴資穎位置／球衣辨識、觀察重點同限制。可重播或喺原站播放。「3D 概念示範」保留原有 16 種模型動畫；呢啲動畫唔代表戴資穎。

YouTube 只喺按載入後連接。嵌入可用性受地區、影片設定同網絡影響；原站連結一直保留。播放器用整秒起止，唔保證逐幀定位；擊球或起動時間全部係人工抽幀估計。

## 已有片段

| 動作 | 官方來源／秒數 | 戴資穎辨識 | 限制 |
|---|---|---|---|
| 準備姿勢＋分腿跳 | [S5，22–26 秒](https://www.youtube.com/watch?v=uqMWN-9rX4c&t=22s) | 近場深色球衣 | 只觀察整體起動，唔量離地高度 |
| 正手高遠球 | [S5，638–642 秒](https://www.youtube.com/watch?v=uqMWN-9rX4c&t=638s) | Huelva，近場白色球衣 | 後場擊球同對方後場接球；冇校準飛行高度 |
| 正手跳殺 | [S6，15–17 秒](https://www.youtube.com/watch?v=tgVClIqjYq4&t=15s) | 側面黑色球衣、黃色球拍 | 原片已係慢鏡；完整回合約 8–12 秒 |
| 正手吊球 | [S7，24–28.5 秒](https://www.youtube.com/watch?v=JLFAuwPs2j4&t=24s) | 側後方黑色球衣、黃色球鞋 | 重播；唔進一步判為劈吊 |
| 正手網前球 | [S5，636–639 秒](https://www.youtube.com/watch?v=uqMWN-9rX4c&t=636s) | Huelva，近場白色球衣 | 拍面同搓球細節未確認 |
| 反手網前球 | [S5，18.5–21.5 秒](https://www.youtube.com/watch?v=uqMWN-9rX4c&t=18s) | 近場深色球衣 | 握拍細節唔夠清楚 |
| 挑球（正手低位） | [S5，634.5–637 秒](https://www.youtube.com/watch?v=uqMWN-9rX4c&t=634s) | Huelva，近場白色球衣 | 移動中接球，唔當靜止餵球模板 |
| 反手短發球 | [S5，117–121 秒](https://www.youtube.com/watch?v=uqMWN-9rX4c&t=117s) | 藍黃球衣近鏡，切到近場 | 切鏡中斷全身畫面，唔作發球高度／雙腳檢查 |

核對方法：逐段查看帶時間碼嘅連續抽幀，確認身份、持拍側、出球位置同下一拍；有側面重播就一齊查看。`frames_reviewed` 只代表以上人工畫面核對，**未經教練覆核，亦未有逐幀觸球標註**。局數／比分未可靠核對時留 `null`。

## 待補嘅 8 種

| 動作 | 要確認嘅證據 |
|---|---|
| 劈吊 | 拍面切擊清晰；前場落點本身唔足以證明切球 |
| 頭頂繞頭殺球 | 同時符合繞頭正手擊球同殺球；繞頭高遠球／吊球唔算 |
| 反手高遠球 | 後場反手出球同後場落點；反手吊球唔算 |
| 正手平抽 | 平快交換同正手擊球；唔直接用推球代替 |
| 反手平抽 | 平快交換同反手擊球；唔用擋網代替 |
| 反手接殺擋網 | 保留對手殺球，再確認反手防守同前場落點 |
| 網前撲球 | 網前向下撲擊；普通放網唔算 |
| 正手發高遠球 | 戴資穎正手發球同對手後場接發；正手短發球唔算 |

## 官方來源同維護

`catalog.json` 係 app 嘅單一教材資料來源。S1–S3 保留為待查完整賽事來源，唔當成已搵到動作：

- [S1：2023 年終賽小組賽，安洗瑩 vs 戴資穎](https://www.youtube.com/watch?v=Iqp7Opdi9fM)
- [S2：2023 年終賽準決賽，安洗瑩 vs 戴資穎](https://www.youtube.com/watch?v=EvlAtReV3LE)
- [S3：2023 年終賽決賽，戴資穎 vs Marin](https://www.youtube.com/watch?v=SzoTHbBy9BA)
- [S4：BWF Total Recall — Best Backhands in 2021](https://www.youtube.com/watch?v=h7SPhxTywAk)（已查看部分畫面，未有符合待補反手細分類嘅教材）
- [S5：Tai Tzu Ying: Queen of Deception](https://www.youtube.com/watch?v=uqMWN-9rX4c)
- [S6：Uber Cup — A stunning jump smash，2018](https://www.youtube.com/watch?v=tgVClIqjYq4)
- [S7：Delightful Drop Shots，2020](https://www.youtube.com/watch?v=JLFAuwPs2j4)

Repo 只保存連結、時間同原創文字筆記，唔包含賽事影片或截圖。研究用暫存影片／抽幀喺忽略嘅 `tmp/`，唔打包或重新發布。新增片段先核對細分類、身份、前後拍同鏡頭限制，再更新 `clips`、動作狀態同統計。執行 `npm run check:tai` 驗證 16 種映射、來源、時間順序、缺口狀態同覆蓋數量。
