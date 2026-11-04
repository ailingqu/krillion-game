import { createDive, EPOCH, findDateDive, isValidDate, utcDate, type Bank, type Dive, type Pack } from './engine';

const PACKS: readonly Pack[] = ['nature', 'science', 'culture', 'food', 'world', 'everyday'];

// A shared seed resumes the same dive; the Unlimited entry starts a fresh one.
export function launchDive(bank: Bank, search: string, dives: Record<string, Dive>, counter = 0, now = Date.now()): Dive | undefined {
  const params = new URLSearchParams(search);
  const seed = params.get('seed'), pack = params.get('pack'), date = params.get('date');
  const today = utcDate(new Date(now));
  const selectedPack = PACKS.find(value => value === pack);
  if (seed && /^[a-zA-Z0-9:_-]{1,80}$/.test(seed)) {
    const dive = createDive(bank, selectedPack ? 'pack' : 'unlimited', seed, today, selectedPack);
    return dives[dive.id] || dive;
  }
  if (params.get('mode') === 'unlimited') {
    return createDive(bank, 'unlimited', `unlimited:all:${now.toString(36)}:${counter}`, today);
  }
  if (isValidDate(date) && date >= EPOCH && date <= today) {
    return findDateDive(dives, date) || createDive(bank, date === today ? 'daily' : 'archive', `daily:${date}`, date);
  }
}
