const normalize = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’‘']/g, '').replace(/[-_\s]+/g, ' ').trim();
const letters = s => normalize(s).replace(/[^a-z]/g, '');

export function compileBank(text) {
  const questions = [];
  const rows = text.split('\n').filter(s => s.trim() && !s.startsWith('#'));
  const seenIds = new Set();
  for (const row of rows) {
    const [category, pack, label, zh, values] = row.split('|');
    if (!values || seenIds.has(category)) throw new Error(`Invalid category: ${category}`);
    seenIds.add(category);
    const entries = values.split(',').map((value, i) => {
      const [text, ...aliases] = value.split('~');
      return { id: `${category}-${i + 1}`, text, aliases };
    });
    const aliasSet = new Set();
    for (const entry of entries) for (const word of new Set([entry.text,...entry.aliases].map(normalize))) {
      if (aliasSet.has(word)) throw new Error(`Ambiguous alias in ${category}: ${word}`);
      aliasSet.add(word);
    }
    const subsets = new Set();
    const add = (key, rule, suffix, suffixZh, accepted) => {
      if (accepted.length < 5 || (key !== 'any' && accepted.length > entries.length * .8)) return;
      const fingerprint = accepted.map(a => a.id).join(',');
      if (subsets.has(fingerprint)) return;
      subsets.add(fingerprint);
      const answers = accepted.map((a, i) => {
        const ratio = i / (accepted.length - 1);
        const tier = i === accepted.length - 1 ? 'krillion' : ratio < .18 ? 'plankton' : ratio < .43 ? 'schooler' : ratio < .72 ? 'rare' : 'deep';
        const score = { plankton: 10, schooler: 30, rare: 60, deep: 85, krillion: 100 }[tier];
        return { ...a, tier, score };
      });
      // An explicitly authored counter-intuitive pick, not fabricated crowd statistics.
      const clever = { fruit: 'Dragon fruit', mammal: 'Platypus', bird: 'Penguin', element: 'Gold', instrument: 'Theremin', language: 'Latin' }[category];
      const pick = answers.find(a => a.text === clever && a.tier !== 'krillion');
      if (pick) { pick.tier = 'clever'; pick.score = 15; }
      questions.push({ id: `${category}-${key}`, category, pack, prompt: `Name ${label}${suffix}.`, promptZh: `说出${zh}${suffixZh}。`, rule, answers });
    };
    add('any', {kind:'any'}, '', '', entries);
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      add(`starts-${letter}`, {kind:'starts',value:letter}, ` starting with ${letter.toUpperCase()}`, `，英文名以 ${letter.toUpperCase()} 开头`, entries.filter(a => letters(a.text).startsWith(letter)));
      add(`contains-${letter}`, {kind:'contains',value:letter}, ` containing the letter ${letter.toUpperCase()}`, `，英文名包含字母 ${letter.toUpperCase()}`, entries.filter(a => letters(a.text).includes(letter)));
      add(`ends-${letter}`, {kind:'ends',value:letter}, ` ending in ${letter.toUpperCase()}`, `，英文名以 ${letter.toUpperCase()} 结尾`, entries.filter(a => letters(a.text).endsWith(letter)));
      add(`without-${letter}`, {kind:'without',value:letter}, ` without the letter ${letter.toUpperCase()}`, `，英文名不含字母 ${letter.toUpperCase()}`, entries.filter(a => !letters(a.text).includes(letter)));
    }
    for (let n = 4; n <= 14; n++) {
      add(`length-${n}`, {kind:'length',value:n}, ` with ${n} letters in its English name (ignore spaces and punctuation)`, `，英文名有 ${n} 个字母（忽略空格和标点）`, entries.filter(a => letters(a.text).length === n));
      if (n % 2 === 0) {
        add(`short-${n}`, {kind:'maxLength',value:n}, ` with at most ${n} letters in its English name (ignore spaces and punctuation)`, `，英文名最多 ${n} 个字母（忽略空格和标点）`, entries.filter(a => letters(a.text).length <= n));
        add(`long-${n}`, {kind:'minLength',value:n}, ` with at least ${n} letters in its English name (ignore spaces and punctuation)`, `，英文名至少 ${n} 个字母（忽略空格和标点）`, entries.filter(a => letters(a.text).length >= n));
      }
    }
    add('multiword', {kind:'multiword'}, ` with a multiword English name`, `，英文名包含多个单词`, entries.filter(a => a.text.includes(' ')));
    add('double', {kind:'double'}, ` with a repeated adjacent letter in its English name`, `，英文名有相邻的重复字母`, entries.filter(a => /([a-z])\1/.test(letters(a.text))));
  }
  if (questions.length < 1000) throw new Error(`Only ${questions.length} questions; expected at least 1000.`);
  return { version: 1, count: questions.length, categories: rows.length, generatedFrom: 'Original curated category sets and deterministic letter/length constraints; editorial rarity, not player-frequency statistics.', questions };
}
