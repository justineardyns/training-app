import { createECDH, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateRequestDetails } from 'web-push';
// @ts-expect-error: geen types voor http_ece
import ece from 'http_ece';
import { weekDays } from '../src/coach/dates.ts';
import { defaultDay } from '../src/coach/availability.ts';
import { makeVapidKeys, b64url } from '../src/data/push.ts';
import { defaultProfile } from '../src/data/store.ts';
import { context, pickMessage, validate } from './coach-cli.ts';
import { loadRepo } from './load.ts';

function repo(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'coach-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

const MON = '2026-11-23';
const base = {
  'data/profile.json': { ...defaultProfile(), setupDone: true, notifyHour: 7 },
  'data/availability/2026-11.json': {
    month: '2026-11',
    days: Object.fromEntries(weekDays(MON).map((date) => [date, date === MON ? { ...defaultDay(date, 45), want: 'strength' } : defaultDay(date, 45)])),
    planned: [MON, '2026-11-25', '2026-11-27', '2026-11-29'],
    savedAt: '',
  },
};

describe('pushmeldingen: sleutels en versleuteling', () => {
  it('VAPID-sleutels uit de app werken met web-push, en de melding is end-to-end versleuteld', async () => {
    const vapid = await makeVapidKeys();
    expect(b64url.decode(vapid.publicKey)).toHaveLength(65);
    expect(b64url.decode(vapid.privateKey)).toHaveLength(32);
    // Een "iPhone": eigen ECDH-sleutels + auth-geheim.
    const client = createECDH('prime256v1');
    client.generateKeys();
    const auth = randomBytes(16);
    const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: client.getPublicKey('base64url'), auth: auth.toString('base64url') } };
    const payload = JSON.stringify({ title: 'Test', body: 'Hallo', url: '#/vandaag' });
    const req = generateRequestDetails(sub, payload, { vapidDetails: { subject: 'https://jij.github.io/training-app/', ...vapid }, TTL: 60 });
    expect(req.headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(req.headers['Content-Encoding']).toBe('aes128gcm');
    const plain = ece.decrypt(req.body, { version: 'aes128gcm', privateKey: client, authSecret: auth.toString('base64url') });
    expect(plain.toString()).toBe(payload);
  });
});

describe('welke melding wanneer', () => {
  it('ochtend: enkel op het ingestelde uur (Brussel, ook in zomertijd)', () => {
    const dir = repo(base);
    expect(pickMessage(loadRepo(dir, { now: new Date('2026-11-23T06:07:00Z') }), { mode: 'morning' }).msg?.title).toBe("Vandaag: Full body A · Jims 's avonds");
    expect(pickMessage(loadRepo(dir, { now: new Date('2026-11-23T05:07:00Z') }), { mode: 'morning' }).msg).toBeNull();
    // Zomer: 7u lokaal = 05u UTC
    const summer = repo({ ...base, 'data/availability/2026-06.json': { month: '2026-06', days: Object.fromEntries(weekDays('2026-06-29').map((date) => [date, defaultDay(date, 45)])), planned: [], savedAt: '' } });
    expect(pickMessage(loadRepo(summer, { now: new Date('2026-06-29T05:07:00Z') }), { mode: 'morning' }).msg).not.toBeNull();
  });

  it('zondag 19u: herinnering als je de komende dagen nog niet aanvinkte', () => {
    const dir = repo(base);
    const r = pickMessage(loadRepo(dir, { now: new Date('2026-11-29T18:07:00Z') }), { mode: 'sunday' });
    expect(r.msg?.title).toBe('Vink je komende dagen aan');
    expect(pickMessage(loadRepo(dir, { now: new Date('2026-11-28T18:07:00Z') }), { mode: 'sunday' }).msg).toBeNull();
  });
});

describe('/coach-hulpmiddelen', () => {
  it('validate: geldige bijsturing → 0, regelbrekende → 1', () => {
    const ok = repo({ ...base, 'data/coach/adjustments.json': { version: 1, targetSessions: 3, focus: 'Slaap' } });
    expect(validate(loadRepo(ok, { now: new Date('2026-11-22T19:00:00Z') }), () => undefined)).toBe(0);
    const bad = repo({ ...base, 'data/coach/adjustments.json': { version: 1, targetSessions: 6, swaps: [{ from: 'leg-press', to: 'db-curl' }] } });
    const out: string[] = [];
    expect(validate(loadRepo(bad, { now: new Date('2026-11-22T19:00:00Z') }), (s) => out.push(s))).toBe(1);
    expect(out.join('\n')).toMatch(/andere spiergroep/);
  });

  it('context bevat rapport, plan volgende week en oefeningen', () => {
    const dir = repo({
      ...base,
      'data/log/2026-W48.json': { week: '2026-W48', sessions: [{ id: 'a', date: MON, kind: 'strength', template: 'A', source: 'app', exercises: [{ exerciseId: 'db-bench', prescription: { exerciseId: 'db-bench', sets: 3, repRange: [8, 12], targetReps: 8, load: 10, restSec: 90, stage: 0, change: 'same', note: '' }, sets: [{ load: 10, reps: 10, done: true }], feel: 'good' }] }], checks: [], postponed: [], light: [] },
    });
    const store = loadRepo(dir, { now: new Date('2026-11-29T19:00:00Z') });
    const c = context(store, MON);
    expect(c.week).toBe('2026-W48');
    expect(c.report.done).toBe(1);
    expect(c.exercises[0]).toMatchObject({ id: 'db-bench', lastLoad: 10, stagnating: false });
    expect(c.nextWeek.violations).toEqual([]);
  });
});
