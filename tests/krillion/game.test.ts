import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { compileBank } from '../../lib/games/krillion/build-bank.mjs';
import { advance, beginRound, createDive, evaluate, expandBank, findDateDive, isValidDate, letters, normalize, restoreDive, score, selectQuestions, shareLink, submit, TIERS, utcDate, zone, type Bank, type Pack } from '../../lib/games/krillion/engine';

const bank = compileBank(readFileSync('lib/games/krillion/categories.txt','utf8')) as Bank;
const question = (id:string) => bank.questions.find(q=>q.id===id)!;

test('bank has >= 1,000 distinct, playable prompts, no duplicate answer subsets in a category',()=>{
  assert.ok(bank.count>=1000);assert.equal(bank.count,bank.questions.length);
  const ids=new Set(),prompts=new Set(),sets=new Set();
  for(const q of bank.questions){
    assert.ok(!ids.has(q.id),q.id);ids.add(q.id);
    assert.ok(!prompts.has(q.prompt),q.prompt);prompts.add(q.prompt);
    const fingerprint=q.category+':'+q.answers.map(a=>a.id).join(',');
    assert.ok(!sets.has(fingerprint),q.id);sets.add(fingerprint);
    assert.ok(q.answers.length>=5,q.id);
    assert.equal(q.answers.filter(a=>a.score===100).length,1,q.id);
    for(const a of q.answers){assert.equal(TIERS[a.tier].score,a.score,q.id);assert.equal(evaluate(q,a.text).answer,a.text,q.id);}
  }
});
test('every accepted canonical answer satisfies its prompt constraint',()=>{
  for(const q of bank.questions)for(const answer of q.answers){
    const text=letters(answer.text),r=q.rule;
    const valid=r.kind==='any'||(r.kind==='starts'&&text.startsWith(String(r.value)))||(r.kind==='ends'&&text.endsWith(String(r.value)))||(r.kind==='contains'&&text.includes(String(r.value)))||(r.kind==='without'&&!text.includes(String(r.value)))||(r.kind==='length'&&text.length===r.value)||(r.kind==='maxLength'&&text.length<=Number(r.value))||(r.kind==='minLength'&&text.length>=Number(r.value))||(r.kind==='multiword'&&answer.text.includes(' '))||(r.kind==='double'&&/([a-z])\1/.test(text));
    assert.ok(valid,`${q.id}: ${answer.text}`);
  }
});
test('all aliases map to the same scored answer without collisions',()=>{
  for(const q of bank.questions.filter(q=>q.rule.kind==='any'))for(const a of q.answers)for(const alias of a.aliases){
    assert.equal(evaluate(q,alias).answer,a.text,`${q.id}: ${alias}`);
    assert.equal(evaluate(q,alias).score,a.score);
  }
});
test('case, accents, spaces, Chinese and harmless punctuation normalize correctly',()=>{
  assert.equal(evaluate(question('fruit-any'),'  APPLE  ').answer,'Apple');
  assert.equal(evaluate(question('fruit-any'),'苹果').answer,'Apple');
  assert.equal(evaluate(question('cheese-any'),'Comté').answer,'Comte');
  assert.equal(evaluate(question('clothing-any'),'T shirt').answer,'T-shirt');
});
test('programming symbols remain distinct, short strings are never autocorrected',()=>{
  const q=question('programming-any');
  assert.notEqual(normalize('C++'),normalize('C'));assert.notEqual(normalize('C#'),normalize('C'));
  assert.equal(evaluate(q,'C++').answer,'C++');assert.equal(evaluate(q,'C#').answer,'C#');assert.equal(evaluate(q,'C').answer,'C');assert.equal(evaluate(q,'P').score,0);
});
test('one unambiguous typo matches; unrelated input, ambiguity and out-of-scope answers do not',()=>{
  assert.equal(evaluate(question('fruit-any'),'pineappl').answer,'Pineapple');assert.equal(evaluate(question('fruit-any'),'pineappl').corrected,true);
  assert.equal(evaluate(question('fruit-any'),'a flying submarine').score,0);
  const q=question('fruit-contains-p');assert.ok(q);assert.equal(evaluate(q,'Banana').score,0);
  const synthetic={...q,answers:[{id:'1',text:'Catfish',aliases:[],tier:'rare' as const,score:60},{id:'2',text:'Batfish',aliases:[],tier:'rare' as const,score:60}]};
  assert.equal(evaluate(synthetic,'Hatfish').score,0);
});
test('daily selection is deterministic, varies across days, and contains seven distinct categories',()=>{
  const a=selectQuestions(bank,'daily:2026-11-04'),b=selectQuestions(bank,'daily:2026-11-04'),c=selectQuestions(bank,'daily:2026-11-05');
  assert.deepEqual(a,b);assert.notDeepEqual(a,c);assert.equal(new Set(a).size,7);assert.equal(new Set(a.map(id=>question(id).category)).size,7);
});
test('all six themed packs support seven unique questions',()=>{
  for(const pack of ['nature','science','culture','food','world','everyday'] as Pack[]){const ids=selectQuestions(bank,'pack:test',pack);assert.equal(new Set(ids).size,7);ids.forEach(id=>assert.equal(question(id).pack,pack));}
});
test('round is 25 seconds, double submit and repeated advance never add scores',()=>{
  let d=beginRound(createDive(bank,'unlimited','round-test','2026-11-04'),1000);
  assert.equal(d.deadline,26000);
  d=submit(d,bank,question(d.questionIds[0]).answers[0].text,2000);
  assert.equal(d.results.length,1);assert.equal(d.phase,'reveal');
  assert.deepEqual(submit(d,bank,'anything',2001),d);
  const next=advance(d,2002);assert.equal(next.phase,'ready');assert.deepEqual(advance(next,2003),next);
});
test('expired deadlines yield zero even for a correct answer; reloading does not extend the deadline',()=>{
  const d=beginRound(createDive(bank,'daily','daily:2026-11-04','2026-11-04'),1000);
  const restored=restoreDive(JSON.parse(JSON.stringify(d)),bank)!;assert.equal(restored.deadline,26000);
  const expired=submit(restored,bank,question(d.questionIds[0]).answers[0].text,26000);
  assert.equal(expired.results[0].timedOut,true);assert.equal(score(expired),0);
});
test('seven gems finish at 700 points and 7,000m; completed dive cannot score again',()=>{
  let d=createDive(bank,'unlimited','perfect','2026-11-04');
  for(let i=0;i<7;i++){d=beginRound(d,i*1000);d=submit(d,bank,question(d.questionIds[i]).answers.find(a=>a.score===100)!.text,i*1000+50);d=advance(d,i*1000+100);}
  assert.equal(d.phase,'complete');assert.equal(score(d),700);assert.equal(zone(score(d)*10)[0],'THE HADAL ZONE');assert.deepEqual(beginRound(d,100000),d);
});
test('malformed saved sessions are rejected and stored scores are recomputed',()=>{
  assert.equal(restoreDive(null,bank),null);assert.equal(restoreDive({version:1},bank),null);
  const d=beginRound(createDive(bank,'daily','saved','2026-11-04'),1000);
  assert.equal(restoreDive({...d,deadline:null},bank),null);assert.equal(restoreDive({...d,questionIds:Array(7).fill(d.questionIds[0])},bank),null);
  const done=submit(d,bank,question(d.questionIds[0]).answers[0].text,1500);done.results[0].score=99999;
  const restored=restoreDive(done,bank)!;assert.ok(restored.results[0].score<=100);
});
test('UTC date boundaries do not depend on local timezone',()=>{
  assert.equal(utcDate(new Date('2026-11-04T07:59:59+08:00')),'2026-11-03');
  assert.equal(utcDate(new Date('2026-11-04T08:00:00+08:00')),'2026-11-04');
});
test('archive continues the original daily result instead of starting another record',()=>{
  const daily=beginRound(createDive(bank,'daily','daily:2026-11-04','2026-11-04'),1000);
  const archive=createDive(bank,'archive','daily:2026-11-04','2026-11-04');
  assert.equal(findDateDive({[daily.id]:daily},'2026-11-04'),daily);
  assert.equal(findDateDive({[archive.id]:archive},'2026-11-04'),archive);
  assert.equal(findDateDive({[daily.id]:daily},'2026-11-05'),undefined);
  const completed={...daily,phase:'complete' as const};
  assert.equal(findDateDive({[daily.id]:completed,[archive.id]:archive},'2026-11-04'),completed);
});
test('corrupt dates, pack identifiers and result records cannot reach the game screen',()=>{
  const d=createDive(bank,'unlimited','test','2026-11-04');
  for(const date of ['2026-02-30','2026-13-01','not a date','2026-11-04T00:00:00Z']){
    assert.equal(isValidDate(date),false);assert.equal(restoreDive({...d,date},bank),null);
  }
  assert.equal(isValidDate('2028-02-29'),true);
  assert.equal(restoreDive({...d,phase:'reveal',results:[null]},bank),null);
  assert.equal(restoreDive({...d,mode:'pack',pack:'invalid'},bank),null);
  assert.equal(restoreDive({...d,mode:'pack',pack:'nature'},bank),null);
});
test('shared dives retain the language and question seed without exposing local paths or unrelated parameters',()=>{
  const d=createDive(bank,'pack','pack:nature:share','2026-11-04','nature');
  assert.equal(shareLink(d,'file:///private/preview.html','zh'),null);
  const shared=new URL(shareLink(d,'https://example.test/games/krillion/index.html?tracking=private#debug','zh')!);
  assert.equal(shared.searchParams.get('seed'),'pack:nature:share');
  assert.equal(shared.searchParams.get('pack'),'nature');
  assert.equal(shared.searchParams.get('lang'),'zh');
  assert.equal(shared.searchParams.has('tracking'),false);assert.equal(shared.hash,'');
  assert.deepEqual(createDive(bank,'pack',shared.searchParams.get('seed')!,d.date,'nature').questionIds,d.questionIds);
  assert.equal(shared.pathname,'/games/krillion');
  assert.equal(new URL(shareLink(d,'https://example.test/fr/games/krillion?seed=old','en')!).pathname,'/fr/games/krillion');
  assert.equal(new URL(shareLink(d,'https://example.test/games/krillion/','en')!).pathname,'/games/krillion');
});
test('new standalone game assets exist and the bundle does not depend on the original service',()=>{
  for(const file of ['index.html','game.js','game.css','bank.json','mascot.svg','pixel.ttf','cover.png','cover-thumb.jpg'])assert.ok(existsSync(`public/games/krillion/${file}`),file);
  // Maintenance and review copies are not uploaded with the site.
  for(const file of ['questions.json','krillion-preview.html'])assert.ok(!existsSync(`public/games/krillion/${file}`),file);
  const bundle=readFileSync('public/games/krillion/game.js','utf8');
  assert.ok(!/fetch\(["']https:\/\/krillion/.test(bundle));
});
test('compact runtime bank expands losslessly and portable preview has no required external assets',()=>{
  assert.deepEqual(expandBank(JSON.parse(readFileSync('public/games/krillion/bank.json','utf8'))),bank);
  const html=readFileSync('.game-previews/krillion-preview.html','utf8');
  assert.ok(html.includes('id="question-bank"'));
  assert.ok(!/<script[^>]+src=/.test(html));
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(html));
  assert.ok(html.includes('data:font/ttf;base64,'));
  assert.ok(html.includes(readFileSync('lib/games/krillion/assets/FONT-LICENSE.txt', 'utf8').trim()), 'portable HTML retains the complete font license');
  assert.ok(html.includes('id="license-notices"'), 'portable HTML retains runtime dependency notices');
});
