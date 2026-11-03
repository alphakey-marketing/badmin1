import type { BodyPart, Check, Hand, Status } from './types';

export const PART_LABEL: Record<BodyPart, string> = {
  legs: '下肢',
  weight: '重心',
  trunk: '軀幹／轉身',
  shoulder: '肩膊',
  elbow: '手肘',
  wrist: '手腕／擊球點',
};

export const STATUS_COLOR: Record<Status, string> = {
  good: '#22c55e',
  warn: '#f59e0b',
  bad: '#ef4444',
  na: '#94a3b8',
};

const RANK: Record<Status, number> = { na: 0, good: 1, warn: 2, bad: 3 };

export function partStatus(checks: Check[]): Record<BodyPart, Status> {
  const out: Record<BodyPart, Status> = { legs: 'na', weight: 'na', trunk: 'na', shoulder: 'na', elbow: 'na', wrist: 'na' };
  for (const c of checks) if (RANK[c.status] > RANK[out[c.part]]) out[c.part] = c.status;
  return out;
}

/** Bones, each tagged with the body part whose status colours it. */
export function bones(hand: Hand): Array<[number, number, BodyPart | null]> {
  const rs = hand === 'right' ? 12 : 11;
  const re = hand === 'right' ? 14 : 13;
  const rw = hand === 'right' ? 16 : 15;
  const os = hand === 'right' ? 11 : 12;
  const oe = hand === 'right' ? 13 : 14;
  const ow = hand === 'right' ? 15 : 16;
  return [
    [11, 12, 'trunk'],
    [23, 24, 'weight'],
    [11, 23, 'trunk'],
    [12, 24, 'trunk'],
    [rs, re, 'shoulder'],
    [re, rw, 'elbow'],
    [os, oe, 'shoulder'],
    [oe, ow, null],
    [23, 25, 'legs'],
    [25, 27, 'legs'],
    [24, 26, 'legs'],
    [26, 28, 'legs'],
    [27, 31, 'legs'],
    [28, 32, 'legs'],
    [27, 29, null],
    [28, 30, null],
    [rw, hand === 'right' ? 20 : 19, 'wrist'],
  ];
}
