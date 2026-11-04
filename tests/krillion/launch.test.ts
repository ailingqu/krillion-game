import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileBank } from '../../lib/games/krillion/build-bank.mjs';
import { beginRound, createDive, shareLink, submit, type Bank } from '../../lib/games/krillion/engine';
import { launchDive } from '../../lib/games/krillion/launch';

const bank = compileBank(readFileSync('lib/games/krillion/categories.txt', 'utf8')) as Bank;
const now = Date.parse('2026-11-05T12:00:00Z');

test('Unlimited entry starts fresh seven-round dives without replacing daily progress', () => {
  const daily = createDive(bank, 'daily', 'daily:2026-11-05', '2026-11-05');
  const saved = { [daily.id]: daily };
  const first = launchDive(bank, '?mode=unlimited', saved, 0, now)!;
  const second = launchDive(bank, '?mode=unlimited', { ...saved, [first.id]: first }, 1, now)!;
  assert.equal(first.mode, 'unlimited');
  assert.equal(first.phase, 'ready');
  assert.equal(first.questionIds.length, 7);
  assert.notEqual(first.id, second.id);
  assert.notDeepEqual(first.questionIds, second.questionIds);
  assert.deepEqual(Object.keys(saved), [daily.id]);
  assert.equal(launchDive(bank, '', saved, 0, now), undefined);
});

test('shared Unlimited and themed links reproduce questions and resume saved results', () => {
  for (const pack of [undefined, 'food'] as const) {
    let dive = createDive(bank, pack ? 'pack' : 'unlimited', 'share-test', '2026-11-05', pack);
    const question = bank.questions.find(q => q.id === dive.questionIds[0])!;
    dive = submit(beginRound(dive, now), bank, question.answers[0].text, now + 1000);
    const link = new URL(shareLink(dive, 'https://example.test/krillion-unlimited', 'zh')!);
    link.searchParams.set('mode', 'unlimited');
    assert.equal(link.pathname, '/krillion-unlimited');
    assert.deepEqual(launchDive(bank, link.search, {}, 0, now)?.questionIds, dive.questionIds);
    assert.equal(launchDive(bank, link.search, { [dive.id]: dive }, 0, now), dive);
  }
});

test('date links preserve daily and archive progress, and leave the Unlimited topic when shared', () => {
  for (const date of ['2026-11-04', '2026-11-05']) {
    const dive = launchDive(bank, `?date=${date}`, {}, 0, now)!;
    assert.equal(dive.mode, date === '2026-11-05' ? 'daily' : 'archive');
    assert.equal(launchDive(bank, `?date=${date}`, { [dive.id]: dive }, 0, now), dive);
    const link = new URL(shareLink(dive, 'https://example.test/krillion-unlimited', 'en')!);
    assert.equal(link.pathname, '/games/krillion');
    assert.equal(link.searchParams.get('date'), date);
  }
});

test('launch parameters reject invalid seeds, dates and inherited pack names', () => {
  for (const search of ['?seed=%3Cscript%3E', '?date=2026-02-30', '?date=2099-01-01', '?date=2026-11-03']) {
    assert.equal(launchDive(bank, search, {}, 0, now), undefined);
  }
  const dive = launchDive(bank, '?seed=valid&pack=constructor', {}, 0, now)!;
  assert.equal(dive.mode, 'unlimited');
  assert.equal(dive.pack, undefined);
  assert.equal(launchDive(bank, '?mode=unlimited&seed=%3Cscript%3E', {}, 0, now)?.mode, 'unlimited');
});
