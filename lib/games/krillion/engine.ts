export type Pack = 'nature' | 'science' | 'culture' | 'food' | 'world' | 'everyday';
export type Tier = 'plankton' | 'clever' | 'schooler' | 'rare' | 'deep' | 'krillion' | 'miss';
export interface Answer { id: string; text: string; aliases: string[]; tier: Tier; score: number }
export interface Question { id: string; category: string; pack: Pack; prompt: string; promptZh: string; rule: { kind: string; value?: string | number }; answers: Answer[] }
export interface Bank { version: number; count: number; categories: number; generatedFrom: string; questions: Question[] }
export interface CompactBank extends Omit<Bank,'questions'> { format: 'compact'; dictionary: Omit<Answer,'tier'|'score'>[]; questions: (Omit<Question,'answers'> & { answers:[number,number][] })[] }
export function expandBank(data: CompactBank): Bank {
  if(data?.format!=='compact'||data.version!==1||!Array.isArray(data.dictionary)||!Array.isArray(data.questions))throw new Error('Invalid question bank');
  const tiers: Record<number,Tier>={10:'plankton',15:'clever',30:'schooler',60:'rare',85:'deep',100:'krillion'};
  return {version:data.version,count:data.count,categories:data.categories,generatedFrom:data.generatedFrom,questions:data.questions.map(q=>({...q,answers:q.answers.map(([index,score])=>{
    if(!data.dictionary[index]||!tiers[score])throw new Error('Invalid answer');
    return {...data.dictionary[index],tier:tiers[score],score};
  })}))};
}
export interface Result { questionId: string; input: string; answer: string; tier: Tier; score: number; corrected: boolean; timedOut: boolean }
export type Phase = 'ready' | 'question' | 'reveal' | 'complete';
export interface Dive { version: 1; id: string; mode: 'daily' | 'unlimited' | 'archive' | 'pack'; date: string; pack?: Pack; questionIds: string[]; results: Result[]; phase: Phase; deadline: number | null; completedAt?: number }
export const ROUND_MS = 25_000;
export const ROUNDS = 7;
export const EPOCH = '2026-11-04';
export const TIERS: Record<Tier, { label: string; zh: string; score: number; color: string; message: string; messageZh: string }> = {
  plankton: { label: 'PLANKTON', zh: '浮游生物', score: 10, color: '#94afc9', message: 'A familiar answer. There is more ocean below.', messageZh: '这是个常见答案。海洋深处还有更多可能。' },
  clever: { label: 'TOO CLEVER', zh: '聪明反被聪明误', score: 15, color: '#f4d787', message: 'The obvious unusual choice. Keep exploring.', messageZh: '这是个容易想到的冷门答案。继续探索吧。' },
  schooler: { label: 'SCHOOLER', zh: '鱼群伙伴', score: 30, color: '#55cde4', message: 'A little further from the familiar.', messageZh: '你已经游出最熟悉的水域。' },
  rare: { label: 'RARE', zh: '稀有答案', score: 60, color: '#a6e6c5', message: 'A lovely find in deeper water.', messageZh: '在深水中发现了一个好答案。' },
  deep: { label: 'DEEP CUT', zh: '深海发现', score: 85, color: '#c8a5ff', message: 'An obscure discovery. Beautiful dive.', messageZh: '一个少见的发现，漂亮的下潜！' },
  krillion: { label: 'ONE IN A KRILLION', zh: '海底珍宝', score: 100, color: '#ff779f', message: 'You found this prompt’s hidden gem.', messageZh: '你找到了这道题的隐藏珍宝。' },
  miss: { label: 'ADRIFT', zh: '随波漂流', score: 0, color: '#adbbd1', message: 'No deeper this time. Keep your spirits up — another discovery awaits!', messageZh: '这次没能潜得更深，别灰心，下一题继续寻宝！' },
};

// Preserve meaningful punctuation: C, C++ and C# are different answers.
export function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[’‘']/g, '').replace(/[-_\s]+/g, ' ').trim();
}
export function letters(value: string): string { return normalize(value).replace(/[^a-z]/g, ''); }
export function utcDate(now = new Date()): string { return now.toISOString().slice(0, 10); }
export function dayNumber(date: string): number { return Math.floor((Date.parse(date) - Date.parse(EPOCH)) / 86400000) + 1; }
export function isValidDate(date: unknown): date is string {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && utcDate(new Date(date)) === date;
}
// A daily dive stays the same record when it appears in the archive tomorrow.
export function findDateDive(dives: Record<string, Dive>, date: string): Dive | undefined {
  const candidates = [dives[`daily:daily:${date}`], dives[`archive:daily:${date}`]].filter((d): d is Dive => !!d);
  return candidates.find(d => d.phase === 'complete') || candidates.sort((a,b) => b.results.length - a.results.length)[0];
}
// Links open the site's Krillion page, which passes the dive on to the game frame.
export function shareLink(dive: Dive, location: string, language: string): string | null {
  const url = new URL(location);
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  url.pathname = url.pathname.replace(/\/games\/krillion\/(index\.html)?$/, '/games/krillion');
  if (dive.mode === 'daily' || dive.mode === 'archive') {
    url.pathname = url.pathname.replace(/\/krillion-unlimited\/?$/, '/games/krillion');
  }
  url.search = ''; url.hash = '';
  url.searchParams.set('lang', language === 'zh' ? 'zh' : 'en');
  if (dive.mode === 'unlimited' || dive.mode === 'pack') {
    url.searchParams.set('seed', dive.id.slice(dive.mode.length + 1));
    if (dive.pack) url.searchParams.set('pack', dive.pack);
  } else url.searchParams.set('date', dive.date);
  return url.href;
}
export function hash(seed: string): number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function shuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items]; let n = hash(seed);
  for (let i = out.length - 1; i > 0; i--) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = n % (i + 1); [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function selectQuestions(bank: Bank, seed: string, pack?: Pack): string[] {
  const pool = bank.questions.filter(q => !pack || q.pack === pack);
  if (pool.length < ROUNDS) throw new Error('Not enough questions in this pack.');
  const categories = shuffle(Array.from(new Set(pool.map(q => q.category))), seed);
  const selected: string[] = [];
  // Rotate categories, favour broad prompts, and keep each seven-question dive varied.
  for (let i = 0; selected.length < ROUNDS; i++) {
    const category = categories[i % categories.length];
    const candidates = pool.filter(q => q.category === category && !selected.includes(q.id));
    if (!candidates.length) continue;
    const broad = candidates.find(q => q.rule.kind === 'any');
    const pick = broad && hash(`${seed}:${i}:broad`) % 3 === 0 ? broad : shuffle(candidates, `${seed}:${i}`)[0];
    selected.push(pick.id);
  }
  return selected;
}
export function createDive(bank: Bank, mode: Dive['mode'], seed: string, date: string, pack?: Pack): Dive {
  return { version: 1, id: `${mode}:${seed}`, mode, date, pack, questionIds: selectQuestions(bank, seed, pack), results: [], phase: 'ready', deadline: null };
}
export function beginRound(dive: Dive, now: number): Dive {
  if (dive.phase !== 'ready' || dive.results.length >= ROUNDS) return dive;
  return { ...dive, phase: 'question', deadline: now + ROUND_MS };
}
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}
export function evaluate(question: Question, input: string, timedOut = false): Result {
  const value = normalize(input.slice(0, 120));
  const miss: Result = { questionId: question.id, input: input.slice(0, 120).trim(), answer: '', tier: 'miss', score: 0, corrected: false, timedOut };
  if (!value || timedOut) return miss;
  const exact = question.answers.find(a => [a.text, ...a.aliases].some(s => normalize(s) === value));
  if (exact) return { ...miss, answer: exact.text, tier: exact.tier, score: exact.score };
  // Only unambiguous Latin typos; never fuzzy-match a short word or a symbol.
  if (!/^[a-z ]{5,}$/.test(value)) return miss;
  const limit = value.length >= 10 ? 2 : 1;
  const matches = question.answers.map(a => ({ answer: a, distance: Math.min(...[a.text, ...a.aliases].filter(s => /^[a-z ]{5,}$/.test(normalize(s))).map(s => distance(value, normalize(s)))) }))
    .filter(m => m.distance <= limit).sort((a, b) => a.distance - b.distance);
  if (!matches.length || (matches[1] && matches[0].distance === matches[1].distance)) return miss;
  const answer = matches[0].answer;
  return { ...miss, answer: answer.text, tier: answer.tier, score: answer.score, corrected: true };
}
export function submit(dive: Dive, bank: Bank, input: string, now: number): Dive {
  if (dive.phase !== 'question' || dive.deadline === null) return dive;
  const question = bank.questions.find(q => q.id === dive.questionIds[dive.results.length]);
  if (!question) return dive;
  const result = evaluate(question, input, now >= dive.deadline);
  return { ...dive, results: [...dive.results, result], phase: 'reveal', deadline: null };
}
export function advance(dive: Dive, now: number): Dive {
  if (dive.phase !== 'reveal') return dive;
  return dive.results.length === ROUNDS ? { ...dive, phase: 'complete', completedAt: now } : { ...dive, phase: 'ready' };
}
export function score(dive: Dive): number { return dive.results.reduce((sum, r) => sum + r.score, 0); }
export function zone(depth: number): [string, string] {
  return depth >= 6000 ? ['THE HADAL ZONE', '超深渊带'] : depth >= 4000 ? ['THE ABYSSAL ZONE', '深渊带'] : depth >= 1000 ? ['THE MIDNIGHT ZONE', '午夜带'] : depth >= 200 ? ['THE TWILIGHT ZONE', '暮光带'] : ['THE SUNLIGHT ZONE', '阳光带'];
}
export function restoreDive(value: unknown, bank: Bank): Dive | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Dive;
  if (d.version !== 1 || typeof d.id !== 'string' || d.id.length > 120 || !['daily','unlimited','archive','pack'].includes(d.mode) || !isValidDate(d.date) || d.date < EPOCH ||
      !Array.isArray(d.questionIds) || d.questionIds.length !== ROUNDS || new Set(d.questionIds).size !== ROUNDS || !d.questionIds.every(id => bank.questions.some(q => q.id === id)) ||
      !Array.isArray(d.results) || d.results.length > ROUNDS || !['ready','question','reveal','complete'].includes(d.phase)) return null;
  if ((d.phase === 'question' && (!Number.isFinite(d.deadline) || d.results.length >= ROUNDS)) || (d.phase === 'ready' && d.results.length >= ROUNDS) ||
      (d.phase === 'complete' && d.results.length !== ROUNDS) || (d.phase === 'reveal' && !d.results.length)) return null;
  if (d.mode === 'pack' && (!['nature','science','culture','food','world','everyday'].includes(d.pack!) || !d.questionIds.every(id => bank.questions.find(q => q.id === id)?.pack === d.pack))) return null;
  const results: Result[] = [];
  for (let i = 0; i < d.results.length; i++) {
    const r = d.results[i];
    if (!r || typeof r.input !== 'string' || typeof r.timedOut !== 'boolean' || r.questionId !== d.questionIds[i]) return null;
    results.push(evaluate(bank.questions.find(q => q.id === r.questionId)!, r.input, r.timedOut));
  }
  return { version:1, id:d.id, mode:d.mode, date:d.date, pack:d.mode === 'pack' ? d.pack : undefined, questionIds:d.questionIds, results, phase:d.phase,
    deadline:d.phase === 'question' ? d.deadline : null, completedAt:d.phase === 'complete' && Number.isFinite(d.completedAt) ? d.completedAt : undefined };
}
