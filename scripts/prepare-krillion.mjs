import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'lib/games/krillion');
const target = path.join(root, 'public/games/krillion');
// Maintenance and review copies stay outside public/, so they are never uploaded with the site.
const previews = path.join(root, '.game-previews');
import { compileBank } from '../lib/games/krillion/build-bank.mjs';

export async function prepareKrillion() {
  await mkdir(target, {recursive:true});
  await mkdir(previews, {recursive:true});
  await Promise.all(['questions.json','krillion-preview.html'].map(f=>rm(path.join(target,f),{force:true})));
  const bank = compileBank(await readFile(path.join(source,'categories.txt'),'utf8'));
  await writeFile(path.join(previews,'krillion-questions.json'), JSON.stringify(bank));
  const dictionary=[],indices=new Map();
  const compact={...bank,format:'compact',dictionary,questions:bank.questions.map(q=>({...q,answers:q.answers.map(({id,text,aliases,score})=>{
    if(!indices.has(id)){indices.set(id,dictionary.length);dictionary.push({id,text,aliases});}
    return [indices.get(id),score];
  })}))};
  await writeFile(path.join(target,'bank.json'),JSON.stringify(compact));
  await build({ entryPoints:[path.join(source,'game.tsx')], outfile:path.join(target,'game.js'), bundle:true, minify:true, format:'iife', platform:'browser', target:['es2020'], jsx:'automatic', external:['./pixel.ttf'], define:{'process.env.NODE_ENV':'"production"'}, legalComments:'eof' });
  await copyFile(path.join(source,'assets/pixel.ttf'),path.join(target,'pixel.ttf'));
  await copyFile(path.join(source,'assets/FONT-LICENSE.txt'),path.join(target,'FONT-LICENSE.txt'));
  const hash = createHash('sha256').update(await readFile(path.join(target,'game.js'))).update(await readFile(path.join(target,'game.css'))).update(JSON.stringify(bank)).digest('hex').slice(0,12);
  await writeFile(path.join(target,'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#061421"><meta name="robots" content="noindex,follow"><link rel="canonical" href="https://cubes-2048.io/games/krillion"><title>Krillion · The Daily Dive</title><meta name="description" content="A seven-prompt ocean word game. Find uncommon answers, explore ${bank.count} prompts and dive deeper."><link rel="icon" href="./mascot.svg" type="image/svg+xml"><link rel="stylesheet" href="./game.css?v=${hash}"></head><body><div id="root"><p style="color:#dce9f8;font-family:monospace;text-align:center;padding:25vh 20px">Descending…</p></div><noscript>This game needs JavaScript enabled.</noscript><script src="./game.js?v=${hash}" defer></script></body></html>`);
  await copyFile(path.join(source,'assets/mascot.svg'),path.join(target,'mascot.svg'));
  await copyFile(path.join(source,'assets/cover.png'),path.join(target,'cover.png'));
  await copyFile(path.join(source,'assets/cover-thumb.jpg'),path.join(target,'cover-thumb.jpg'));
  // A portable review copy also runs from file:// when a preview server is unavailable.
  const [html,js,css,font,mascot]=await Promise.all(['index.html','game.js','game.css','pixel.ttf','mascot.svg'].map(f=>readFile(path.join(target,f))));
  const embeddedCss=css.toString().replace(/url\([^)]*pixel\.ttf[^)]*\)/g,()=>`url(data:font/ttf;base64,${font.toString('base64')})`);
  const preview=html.toString().replace('href="./mascot.svg"',()=>`href="data:image/svg+xml;base64,${mascot.toString('base64')}"`)
    .replace(/<link rel="stylesheet"[^>]+>/,()=>`<style>${embeddedCss.replace(/<\/style/gi,'<\\/style')}</style>`)
    .replace(/<script src="\.\/game\.js[^>]+><\/script>/,()=>`<script type="application/json" id="question-bank">${JSON.stringify(compact).replace(/</g,'\\u003c')}</script><script>${js.toString().replace(/<\/script/gi,'<\\/script')}</script>`);
  await writeFile(path.join(previews,'krillion-preview.html'),preview);
  console.log(`Krillion prepared: ${bank.count} unique prompts across ${bank.categories} categories.`);
  return bank;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await prepareKrillion();
