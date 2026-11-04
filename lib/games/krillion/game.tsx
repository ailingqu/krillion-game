import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { advance, Bank, beginRound, createDive, dayNumber, Dive, EPOCH, expandBank, findDateDive, isValidDate, Pack, Question, restoreDive, score, shareLink, submit, TIERS, Tier, utcDate, zone } from './engine';
import './game.css';
import { launchDive } from './launch';

type Language = 'en' | 'zh';
type Screen = 'home' | 'play' | 'archive' | 'packs' | 'stats' | 'bank';
type Panel = 'menu' | 'settings' | 'wardrobe' | 'help' | null;
interface Preferences { language: Language; sound: boolean; motion: boolean; scanlines: boolean; skin: number }
interface Save { version: 1; preferences: Preferences; dives: Record<string,Dive>; counter: number; active?: string }
const KEY = 'cubes.krillion.v1';
const defaults: Preferences = { language: 'en', sound: true, motion: true, scanlines: true, skin: 0 };
const packs: Record<Pack,[string,string,string]> = { nature:['NATURE','自然万物','✿'],science:['SCIENCE','科学探索','✧'],culture:['CULTURE','文化艺术','♫'],food:['FOOD & DRINK','美食饮品','♨'],world:['OUR WORLD','环游世界','◎'],everyday:['EVERYDAY','日常生活','⌂'] };
const Lang = createContext<Language>('en');
function useText() { const language = useContext(Lang); return (en:string,zh:string) => language === 'zh' ? zh : en; }
function readSave(): Save {
  const requested = new URLSearchParams(location.search).get('lang');
  const initial = { ...defaults, language: requested === 'zh' ? 'zh' as const : 'en' as const };
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (value?.version === 1 && value.dives && typeof value.dives === 'object' && !Array.isArray(value.dives)) {
      const p = value.preferences || {};
      const dives=Object.fromEntries(Object.entries(value.dives).filter(([,d])=>d && typeof d==='object' && Array.isArray((d as Dive).results) && typeof (d as Dive).phase==='string')) as Record<string,Dive>;
      return { version:1, preferences:{ language: requested === 'zh' || (requested !== 'en' && p.language === 'zh') ? 'zh':'en', sound:p.sound !== false, motion:p.motion !== false, scanlines:p.scanlines !== false, skin:Number.isInteger(p.skin) && p.skin >= 0 && p.skin <= 4 ? p.skin : 0 }, dives, counter:Number.isSafeInteger(value.counter) && value.counter >= 0 ? value.counter:0, active:typeof value.active === 'string' ? value.active:undefined };
    }
  } catch { /* Private browsing or malformed saves should not prevent play. */ }
  return { version:1, preferences:initial, dives:{}, counter:0 };
}

// Inside the site's frame, share the page the player is reading (keeps its language prefix).
function pageHref() {
  try { if (window.parent !== window && window.parent.location.origin === location.origin) return window.parent.location.href; } catch { /* Cross-origin parent. */ }
  return location.href;
}

let audio: AudioContext | undefined;
function playSound(enabled:boolean, kind:'start'|'answer'|'miss'|'finish' = 'answer') {
  if (!enabled) return;
  try {
    audio ||= new AudioContext();
    void audio.resume();
    const notes = kind === 'miss' ? [150,100] : kind === 'finish' ? [330,440,554,660,880] : kind === 'start' ? [440,330,220] : [330,440,660];
    notes.forEach((frequency,i) => {
      const oscillator = audio!.createOscillator(), gain = audio!.createGain(), time = audio!.currentTime + i * .11;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(.0001,time); gain.gain.exponentialRampToValueAtTime(.045,time+.02); gain.gain.exponentialRampToValueAtTime(.0001,time+.2);
      oscillator.connect(gain); gain.connect(audio!.destination); oscillator.start(time); oscillator.stop(time+.21);
    });
  } catch { /* Sound is optional. */ }
}

function Icon({name}:{name:'menu'|'sound'|'muted'|'settings'|'shirt'|'close'|'home'}) {
  const paths = {menu:'M4 5h16v3H4zm0 6h16v3H4zm0 6h16v3H4z',sound:'M3 9h4l5-5v16l-5-5H3zm12-2h2v10h-2zm4-3h2v16h-2z',muted:'M3 9h4l5-5v16l-5-5H3zm12-1 6 6-2 2-6-6zm4-1 2 2-6 6-2-2z',settings:'M9 2h6v4l3 1 3-1 2 5-3 2v3l-3 1-1 4h-7l-1-4-3-1v-3l-3-2 2-5 3 1 2-1z M10 9v6h5V9z',shirt:'m8 3 4 3 4-3 7 5-4 5-3-2v10H8V11l-3 2-4-5z',close:'m5 3 7 7 7-7 2 2-7 7 7 7-2 2-7-7-7 7-2-2 7-7-7-7z',home:'m2 11 10-9 10 9h-4v11h-5v-7h-3v7H5V11z'};
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={paths[name]} fill="currentColor" fillRule="evenodd"/></svg>;
}
const mascotUrl=document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href||'./mascot.svg';
function Shrimp({skin=0,className=''}:{skin?:number;className?:string}) { return <img className={`shrimp skin-${skin} ${className}`} src={mascotUrl} alt="" width="64" height="80" draggable={false}/>; }
function Ocean({home,depth,diving,skin,motion}:{home:boolean;depth:number;diving:boolean;skin:number;motion:boolean}) {
  const t = useText();
  const bands = [0,100,200,300,600,1000,2000,4000,6000,7000];
  return <div className={`ocean ${home?'at-surface':'underwater'} ${diving?'diving':''}`} aria-hidden="true" style={{'--water-light':Math.max(10,29-depth/290), '--depth-shift':`${Math.min(depth/8,700)}px`} as React.CSSProperties}>
    <div className="sky"><svg className="clouds" viewBox="0 0 1200 240" preserveAspectRatio="none"><g fill="#f4f9f9" opacity=".84"><path d="M-20 90h40V70h24V45h65v20h30v30h35v18h35v28H-20zM470 105h28V80h24V62h28V40h50v24h30v24h27v18h40v25H470zM1015 125h24v-24h27V70h34V40h68v30h31v28h34v53h-218z"/><path d="M160 0h165v14h48v13H150zM740 0h180v18h-42v14H755z"/></g></svg><div className="sun-glow"/></div>
    <svg className="boat" viewBox="0 0 150 100"><path fill="#102b3e" d="M2 73h14v-7h38V46h-6v-6h22V2h5v38h32v6h-6v20h25V56h18v7h-10v18h-8v10H12v-9H2z"/><path fill="#ff6294" d="M69 3H52v5H39v6h-9v7h39z"/><path fill="#aadce8" d="M65 48h6v12h-6zm20 0h6v12h-6z"/></svg>
    <div className="water"><svg className="wave" viewBox="0 0 1200 22" preserveAspectRatio="none"><path d="M0 8Q70 18 160 8T330 11T510 8T700 10T870 8T1040 9T1200 8V22H0z" fill="#1a4a6a"/></svg><div className="rays"/>
      {Array.from({length:19},(_,i)=><i key={`fish${i}`} className={`fish fish-${i%3}`} style={{left:`${(i*37+9)%95}%`,top:`${(i*29+12)%95}%`,animationDelay:`-${i*2}s`}}/>)}
      {Array.from({length:26},(_,i)=><i key={`bubble${i}`} className="bubble" style={{left:`${(i*41+7)%97}%`,top:`${(i*17+15)%100}%`,width:4+(i%4)*3,height:4+(i%4)*3,animationDelay:`-${i*.8}s`,animationDuration:`${9+i%7}s`}}/>)}
    </div>
    <div className="ruler">{bands.map((n,i)=><span key={n} style={{top:`${i*13}%`}}>{home?n:Math.max(0,Math.floor(depth/100)*100+(i-2)*100)}m</span>)}</div>
    {!home && <><span className="sea-note left-note">── {depth<1000?t('light fades as you descend','下潜时，光逐渐消逝'):depth<4000?t('a world beyond sunlight','阳光之外的世界'):t('quiet, dark, and full of discovery','幽暗寂静，等待探索')}</span><span className="sea-note right-note">{zone(depth)[t('en','zh')==='zh'?1:0]} ──</span><div className={`diver ${motion?'floating':''}`}><Shrimp skin={skin}/></div></>}
    {home && <div className="home-friend"><Shrimp skin={skin}/><span>blub!</span></div>}
  </div>;
}

function Modal({panel,close,children}:{panel:Panel;close:()=>void;children:React.ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null); const t=useText();
  useEffect(()=>{const dialog=ref.current; const previous=document.activeElement as HTMLElement|null; dialog?.showModal();return()=>{dialog?.close();previous?.focus();};},[]);
  return <dialog className={`pixel-modal ${panel==='menu'?'menu-modal':''}`} ref={ref} onCancel={close} onClick={e=>{if(e.target===e.currentTarget)close();}} aria-label={t(panel || 'Menu',panel==='settings'?'设置':panel==='wardrobe'?'衣橱':panel==='help'?'玩法说明':'菜单')}><button className="icon-button close" onClick={close} aria-label={t('Close','关闭')}><Icon name="close"/></button>{children}</dialog>;
}
function App() {
  const [bank,setBank]=useState<Bank|null>(null),[failure,setFailure]=useState(false),[save,setSave]=useState<Save>(readSave),[screen,setScreen]=useState<Screen>('home'),[panel,setPanel]=useState<Panel>(null),[storageError,setStorageError]=useState(false),[toast,setToast]=useState('');
  const p=save.preferences, t=(en:string,zh:string)=>p.language==='zh'?zh:en;
  const initialised=useRef(false);
  const load=()=>{setFailure(false);const embedded=document.getElementById('question-bank')?.textContent;const request=embedded?Promise.resolve().then(()=>JSON.parse(embedded)):fetch('./bank.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('bank');return r.json();});request.then(expandBank).then((data:Bank)=>{if(data.questions.length<1000)throw new Error('bank');setSave(s=>{const dives:Record<string,Dive>={};for(const [id,value] of Object.entries(s.dives)){const valid=restoreDive(value,data);if(valid && valid.id===id)dives[id]=valid;}return {...s,dives,active:s.active && dives[s.active]?s.active:undefined};});setBank(data);}).catch(()=>setFailure(true));};
  useEffect(load,[]);
  useEffect(()=>{if(!bank)return;try{localStorage.setItem(KEY,JSON.stringify(save));setStorageError(false);}catch{setStorageError(true);}},[save,bank]);
  useEffect(()=>{document.documentElement.lang=p.language;document.title=`Krillion · ${t('The Daily Dive','每日深潜')}`;},[p.language]);
  useEffect(()=>{if(toast){const timeout=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(timeout);}},[toast]);
  useEffect(()=>{
    if(!bank||initialised.current)return;initialised.current=true;
    const d=launchDive(bank,location.search,save.dives,save.counter);
    if(d){setSave(s=>({...s,dives:{...s.dives,[d.id]:d},active:d.id,counter:s.counter+1}));setScreen('play');}
  },[bank]);
  const dive=save.active?save.dives[save.active]:undefined;
  const updateDive=(d:Dive)=>setSave(s=>{
    const entries=Object.entries(s.dives).filter(([id,v])=>id===d.id||v.mode==='daily'||v.mode==='archive'||v.phase!=='complete').concat(Object.entries(s.dives).filter(([id,v])=>id!==d.id && v.mode!=='daily' && v.mode!=='archive' && v.phase==='complete').slice(-150));
    return {...s,dives:{...Object.fromEntries(entries),[d.id]:d},active:d.id};
  });
  const prefs=(values:Partial<Preferences>)=>setSave(s=>({...s,preferences:{...s.preferences,...values}}));
  const start=(mode:Dive['mode'],date=utcDate(),pack?:Pack)=>{
    if(!bank)return;
    const seed=mode==='daily'||mode==='archive'?`daily:${date}`:`${mode}:${pack||'all'}:${Date.now().toString(36)}:${save.counter}`;
    const d=createDive(bank,mode,seed,date,pack),existing=mode==='daily'||mode==='archive'?findDateDive(save.dives,date):save.dives[d.id];
    updateDive(existing||d);setSave(s=>({...s,counter:s.counter+1}));setScreen('play');setPanel(null);
    playSound(p.sound,'start');
  };
  const go=(destination:Screen)=>{setScreen(destination);setPanel(null);};
  const total=screen==='play'&&dive?score(dive):0;
  const home=screen==='home';
  const daily=findDateDive(save.dives,utcDate());
  const completed=Object.values(save.dives).filter(d=>d.phase==='complete');
  const resume=dive&&dive.phase!=='complete';
  const share=async(d:Dive)=>{
    const squares=d.results.map(r=>({plankton:'⬜',clever:'🟨',schooler:'🟦',rare:'🟩',deep:'🟪',krillion:'🟥',miss:'⬛'}[r.tier])).join('');
    const url=shareLink(d,pageHref(),p.language);
    const message=`KRILLION · ${d.mode==='daily'?d.date:t('My dive','我的深潜')}\n${squares}\n${score(d)}/700 · ${score(d)*10}m\n${url||''}`.trim();
    try{await navigator.clipboard.writeText(message);setToast(t('Dive copied! Paste it to share.','已复制成绩，可以粘贴分享。'));}catch{setToast(t('Copy your result below.','请复制下方成绩。'));setShareText(message);}
  };
  const [shareText,setShareText]=useState('');
  return <Lang.Provider value={p.language}><div className={`game ${p.scanlines?'scanlines':''} ${p.motion?'':'reduce-motion'} ${home?'home-screen':''}`}>
    <Ocean home={home} depth={total*10} diving={screen==='play'&&dive?.phase==='reveal'} skin={p.skin} motion={p.motion}/>
    <button className="icon-button menu-toggle" onClick={()=>setPanel('menu')} aria-label={t('Open menu','打开菜单')}><Icon name="menu"/></button>
    <div className="utility"><button className="icon-button" aria-label={t(p.sound?'Mute sound':'Enable sound',p.sound?'关闭声音':'开启声音')} aria-pressed={p.sound} onClick={()=>{prefs({sound:!p.sound});playSound(!p.sound);}}><Icon name={p.sound?'sound':'muted'}/></button><button className="icon-button" onClick={()=>setPanel('settings')} aria-label={t('Open settings','打开设置')}><Icon name="settings"/></button>{home&&<button className="icon-button" onClick={()=>setPanel('wardrobe')} aria-label={t('Open wardrobe','打开衣橱')}><Icon name="shirt"/></button>}</div>
    {storageError&&<div className="save-warning" role="status">{t('Progress cannot be saved in this browser. Keep this tab open.','当前浏览器无法保存进度，请保持此标签页打开。')}</div>}
    {!bank ? <main className="loading"><Shrimp/><h1>{failure?t('Your dive could not load. Please try again.','暂时无法开始深潜，请稍后重试。'):t('descending…','正在下潜…')}</h1>{failure&&<button className="pixel-button" onClick={load}>{t('TRY AGAIN','重试')}</button>}</main> : <>
      {screen==='home'&&<main className="home-content"><header className="title-block"><h1 className="logo">KRILLION</h1><p className="subtitle">{t('THE DAILY DIVE','每日深潜')}</p><p className="tagline">{t('7 prompts · 25 seconds each · rarer answers sink deeper','7 道题 · 每题 25 秒 · 答案越稀有，潜得越深')}</p></header><div className="home-actions"><details className="howto"><summary>{t('HOW TO PLAY','玩法说明')}</summary><Rules/></details><button className="pixel-button begin" onClick={()=>start('daily')}>▼ {daily?.phase==='complete'?t('VIEW TODAY’S DIVE','查看今日成绩'):daily?t('CONTINUE DESCENT','继续今日深潜'):t('BEGIN DESCENT','开始下潜')} ▼</button><div className="home-links"><span>{t('DIVE','深潜')} #{Math.max(1,dayNumber(utcDate()))}</span><button onClick={()=>go('archive')}>{t('ARCHIVE','历史')} ⟲</button><button onClick={()=>go('packs')}>{t('THEMED PACKS','主题题包')}</button><button onClick={()=>start('unlimited')}>{t('UNLIMITED','无限模式')} ∞</button></div>{resume&&dive?.mode!=='daily'&&<button className="resume text-button" onClick={()=>go('play')}>{t('Resume your unfinished dive','继续上次未完成的深潜')} →</button>}<p className="bank-count">{bank.count.toLocaleString()} {t('prompts to explore','道题等待探索')} · {bank.categories} {t('categories','个分类')}</p><button className="small-link" onClick={()=>setPanel('help')}>{t('Game guide','游戏指南')}</button></div></main>}
      {screen==='play'&&dive&&<Play key={dive.id} bank={bank} dive={dive} update={updateDive} preferences={p} share={share} again={()=>start(dive.mode==='daily'?'unlimited':dive.mode==='archive'?'unlimited':dive.mode,utcDate(),dive.pack)} home={()=>go('home')}/>}
      {screen==='archive'&&<Archive bank={bank} dives={save.dives} start={date=>start(date===utcDate()?'daily':'archive',date)} home={()=>go('home')}/>}
      {screen==='packs'&&<main className="page-content"><PageHeading title={t('THEMED PACKS','主题题包')} subtitle={t('Pick a world. Find its hidden gems.','选择一个世界，发现其中的珍宝。')} home={()=>go('home')}/><div className="pack-grid">{Object.entries(packs).map(([key,labels])=><button className="pack-card" key={key} onClick={()=>start('pack',utcDate(),key as Pack)}><span className="pack-icon">{labels[2]}</span><strong>{labels[p.language==='zh'?1:0]}</strong><small>{bank.questions.filter(q=>q.pack===key).length} {t('prompts','道题')}</small><span className="pack-arrow">↘</span></button>)}</div><p className="quiet">{t('All packs are free to play. Progress is saved in this browser.','所有主题均可免费游玩，进度自动保存在当前浏览器。')}</p></main>}
      {screen==='stats'&&<main className="page-content"><PageHeading title={t('MY KRILLION','我的深潜')} subtitle={t('Your saved results and discoveries.','查看已保存的成绩与深潜记录。')} home={()=>go('home')}/><div className="stats-grid"><Stat label={t('SAVED DIVES','已存局数')} value={completed.length}/><Stat label={t('BEST SCORE','最佳分数')} value={Math.max(0,...completed.map(score))}/><Stat label={t('DEEPEST','最深纪录')} value={`${Math.max(0,...completed.map(score))*10}m`}/><Stat label={t('GEMS FOUND','找到珍宝')} value={completed.flatMap(d=>d.results).filter(r=>r.tier==='krillion').length}/></div><h2>{t('DIVE LOG','潜水日志')}</h2>{completed.length===0?<p className="quiet">{t('Your first discovery is waiting. Begin a dive to fill this log.','还没有完成的深潜，开始第一局吧。')}</p>:<div className="log">{completed.slice().sort((a,b)=>(b.completedAt||0)-(a.completedAt||0)).slice(0,30).map(d=><button key={d.id} onClick={()=>{updateDive(d);go('play');}}><span>{d.date}<small>{t({daily:'Daily',archive:'Archive',unlimited:'Unlimited',pack:'Themed dive'}[d.mode],{daily:'每日挑战',archive:'历史挑战',unlimited:'无限模式',pack:'主题挑战'}[d.mode])}</small></span><b>{score(d)*10}m</b><span>→</span></button>)}</div>}</main>}
      {screen==='bank'&&<QuestionLibrary bank={bank} home={()=>go('home')}/>}
    </>}
    {panel&&<Modal panel={panel} close={()=>setPanel(null)}>
      {panel==='menu'&&<><h2>{t('DIVE IN','潜入海洋')}</h2><nav className="menu-list"><button onClick={()=>go('home')}>⌂ {t('Daily dive','每日深潜')}</button><button onClick={()=>start('unlimited')}>∞ {t('Unlimited','无限模式')}</button><button onClick={()=>go('archive')}>⟲ {t('Archive','历史挑战')}</button><button onClick={()=>go('packs')}>▦ {t('Themed packs','主题题包')}</button><button onClick={()=>go('stats')}>◇ {t('My Krillion','我的深潜')}</button><button onClick={()=>go('bank')}>▤ {t('Question library','浏览题库')}</button><button onClick={()=>setPanel('settings')}>⚙ {t('Settings','设置')}</button><button onClick={()=>setPanel('help')}>? {t('How to play','玩法说明')}</button></nav><p className="quiet">one in a krillion.</p></>}
      {panel==='settings'&&<><h2>{t('SETTINGS','设置')}</h2><div className="setting-row"><label htmlFor="language">{t('Language','语言')}</label><select id="language" value={p.language} onChange={e=>prefs({language:e.target.value as Language})}><option value="en">English</option><option value="zh">简体中文</option></select></div>{([['sound','Sound','音效'],['motion','Animations','动画'],['scanlines','Retro screen effect','复古画面效果']] as const).map(([key,en,zh])=><label className="setting-row" key={key}>{t(en,zh)}<input type="checkbox" checked={p[key]} onChange={e=>prefs({[key]:e.target.checked})}/></label>)}<p className="quiet">{t('The clock keeps running while menus are open or the tab is hidden.','打开菜单或切换标签页时，答题倒计时继续。')}</p></>}
      {panel==='wardrobe'&&<><h2>{t('YOUR LITTLE DIVER','你的小小潜水员')}</h2><p className="quiet">{t('A little color for a big ocean.','为广阔海洋添一点颜色。')}</p><div className="skins">{[['CORAL','珊瑚粉'],['LAGOON','海湾蓝'],['GOLD','流金色'],['LILAC','丁香紫'],['MINT','薄荷绿']].map((label,i)=><button key={label[0]} className={p.skin===i?'selected':''} aria-pressed={p.skin===i} onClick={()=>prefs({skin:i})}><Shrimp skin={i}/><small>{t(label[0],label[1])}</small></button>)}</div></>}
      {panel==='help'&&<><h2>{t('HOW TO PLAY','玩法说明')}</h2><Rules/><h3>{t('ANSWER SCORES','答案与得分')}</h3><div className="tier-guide">{Object.entries(TIERS).filter(([key])=>key!=='miss').map(([key,v])=><div key={key} style={{color:v.color}}><span>{t(v.label,v.zh)}</span><b>{v.score}</b></div>)}</div><p className="quiet">{t('Each answer has a fixed score that does not change with other players’ choices. Letter and word-length challenges use the English name shown in the answer list. You can also answer with common Chinese names.','每个答案的分数固定，不会随其他玩家的选择变化。字母和词长要求以答案列表中的英文名称为准，也可输入常见中文名称作答。')}</p><p className="quiet">{t('A new daily dive arrives at 00:00 UTC. Play Unlimited and themed dives any time, with no account needed. Progress is saved in this browser; clearing browser data removes it.','每日挑战于北京时间 08:00（UTC 00:00）更新。无限模式和主题挑战可随时游玩，无需登录。进度保存在当前浏览器，清除浏览器数据后将无法恢复。')}</p><p className="quiet">{t('This edition is provided independently by Cubes 2048. Accounts and results are separate from krillion.io.','本版本由 Cubes 2048 独立提供，账号与成绩不与 krillion.io 互通。')}</p><a href="https://krillion.io/" target="_blank" rel="noreferrer">{t('Discover Krillion ↗','了解 Krillion ↗')}</a></>}
    </Modal>}
    {shareText&&<Modal panel="help" close={()=>setShareText('')}><h2>{t('SHARE YOUR DIVE','分享成绩')}</h2><textarea aria-label={t('Share text','分享文本')} value={shareText} readOnly onFocus={e=>e.target.select()} rows={6}/></Modal>}
    {toast&&<div className="toast" role="status">{toast}</div>}
  </div></Lang.Provider>;
}
function Rules() { const t=useText(); return <ul className="rules"><li>{t('Seven prompts. One answer for each.','每局七道题，每题提交一个答案。')}</li><li>{t('You have 25 seconds to think and type.','每题有 25 秒思考并输入。')}</li><li>{t('Uncommon answers take you further down.','越稀有的答案，让你下潜得越深。')}</li><li>{t('Each point adds 10 meters. Reach 7,000m.','每分下潜 10 米，向 7,000 米挑战。')}</li><li>{t('One daily dive; unlimited practice whenever you like.','每日挑战只有一次，无限模式可以反复练习。')}</li></ul>; }
function Stat({label,value}:{label:string;value:string|number}) { return <div className="stat"><small>{label}</small><strong>{value}</strong></div>; }
function PageHeading({title,subtitle,home}:{title:string;subtitle:string;home:()=>void}) {const t=useText();return <header className="page-heading"><button className="text-button" onClick={home}>← {t('SURFACE','返回海面')}</button><h1>{title}</h1><p>{subtitle}</p></header>;}

function Play({bank,dive,update,preferences:p,share,again,home}:{bank:Bank;dive:Dive;update:(d:Dive)=>void;preferences:Preferences;share:(d:Dive)=>void;again:()=>void;home:()=>void}) {
  const t=useText(),[input,setInput]=useState(''),[remaining,setRemaining]=useState(25),[countdown,setCountdown]=useState(3),[showAnswers,setShowAnswers]=useState(false),[animating,setAnimating]=useState(false);
  const current=useRef(dive), answerRef=useRef<HTMLInputElement>(null), compose=useRef(false), lastSound=useRef(''); current.current=dive;
  const isReveal=dive.phase==='reveal', result=dive.results[dive.results.length-1], round=dive.results.length;
  const question=bank.questions.find(q=>q.id===dive.questionIds[isReveal?round-1:Math.min(round,6)])!;
  const total=score(dive), depth=total*10;
  useEffect(()=>{
    if(dive.phase!=='ready')return;setCountdown(3);setInput('');setShowAnswers(false);
    const start=Date.now();const interval=setInterval(()=>{const left=Math.max(0,3-Math.floor((Date.now()-start)/1000));setCountdown(left);if(left===0){clearInterval(interval);update(beginRound(current.current,Date.now()));}},100);
    return()=>clearInterval(interval);
  },[dive.phase,dive.results.length]);
  useEffect(()=>{
    if(dive.phase!=='question')return;
    const tick=()=>{const d=current.current;const left=Math.max(0,(d.deadline!-Date.now())/1000);setRemaining(Math.ceil(left));if(left<=0&&d.phase==='question'){const next=submit(d,bank,'',Date.now());current.current=next;update(next);}};
    tick();const interval=setInterval(tick,100);document.addEventListener('visibilitychange',tick);answerRef.current?.focus({preventScroll:true});
    return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',tick);};
  },[dive.phase,dive.deadline]);
  useEffect(()=>{
    if(!isReveal)return;
    const soundKey=`${dive.id}:${round}`;if(lastSound.current!==soundKey){playSound(p.sound,result.score?'answer':'miss');lastSound.current=soundKey;}
    setAnimating(p.motion);const timeout=setTimeout(()=>setAnimating(false),p.motion?1500:0);return()=>clearTimeout(timeout);
  },[isReveal,round]);
  const answer=()=>{const d=current.current;if(!input.trim()||compose.current||d.phase!=='question')return;const next=submit(d,bank,input,Date.now());current.current=next;update(next);};
  if(dive.phase==='complete')return <main className="results page-content"><p className="eyebrow">{t('DIVE COMPLETE','深潜完成')} · {dive.date}</p><h1>{t('BACK FROM THE DEEP','带着发现，浮上海面')}</h1><Shrimp skin={p.skin}/><div className="final-depth">{depth.toLocaleString()}<span>m</span></div><p className="zone-label">{zone(depth)[p.language==='zh'?1:0]}</p><div className="final-score">{total} / 700 {t('POINTS','分')}</div><div className="result-list">{dive.results.map((r,i)=>{const q=bank.questions.find(q=>q.id===r.questionId)!;return <details key={r.questionId}><summary><span className="round-number">{i+1}</span><span className="result-word">{r.answer||r.input||t('No answer','未作答')}<small>{t(TIERS[r.tier].label,TIERS[r.tier].zh)}</small></span><b style={{color:TIERS[r.tier].color}}>+{r.score}</b><span>⌄</span></summary><p>{p.language==='zh'?q.promptZh:q.prompt}</p><AnswerList question={q}/></details>;})}</div><div className="result-actions"><button className="pixel-button primary" onClick={()=>share(dive)}>{t('SHARE YOUR DIVE','分享深潜成绩')} ↗</button><button className="pixel-button" onClick={again}>{t('DIVE AGAIN','再潜一次')} ∞</button></div><button className="text-button" onClick={home}>↑ {t('BACK TO THE SURFACE','返回海面')}</button></main>;
  return <main className={`play-content ${animating?'is-descending':''}`}>
    <header className="hud"><Stat label={t('DEPTH','深度')} value={`${depth.toLocaleString()}m`}/><div className="progress"><div aria-label={t(`Prompt ${Math.min(round+(isReveal?0:1),7)} of 7`,`第 ${Math.min(round+(isReveal?0:1),7)} 题，共 7 题`)}>{Array.from({length:7},(_,i)=><i key={i} style={{background:dive.results[i]?TIERS[dive.results[i].tier].color:(!isReveal&&i===round?'#f46b9d':undefined)}}/>)}</div><small>{t('PROMPT','题目')} {Math.min(round+(isReveal?0:1),7)} {t('OF','/')} 7</small></div><Stat label={t('SCORE','得分')} value={total}/></header>
    <section className={`prompt-panel ${isReveal?'revealed':''}`} aria-live="polite">
      {!isReveal?<><p className="eyebrow">{t('PROMPT','题目')} {round+1} {t('OF','/')} 7</p><h1>{p.language==='zh'?question.promptZh:question.prompt}</h1><p className="prompt-note">▼ {t('rarer answers sink deeper','答案越稀有，潜得越深')} ▼</p></>:<><p className="tier-label" style={{color:TIERS[result.tier].color}}>{result.timedOut?t('TIME’S UP','时间到'):t(TIERS[result.tier].label,TIERS[result.tier].zh)}</p><h1 className="reveal-answer">“{result.answer||result.input||'…'}”</h1>{result.corrected&&<p className="correction">{t('Answer recognized as','答案识别为')} “{result.input}” → {result.answer}</p>}<p className="points" style={{color:TIERS[result.tier].color}}>+{result.score} {t('PTS','分')} · {t('sink','下潜')} {result.score*10}m</p><p className="reveal-message">{result.timedOut?t('Time slipped away. Take a breath and try the next dive.','时间悄悄溜走了，调整呼吸，下一题再试试。'):t(TIERS[result.tier].message,TIERS[result.tier].messageZh)}</p></>}
    </section>
    {!isReveal&&<div className="answer-area">{dive.phase==='ready'?<div className="ready-count" role="status"><span>{countdown}</span>{t('descending · get ready','正在下潜 · 准备好')}</div>:<><div className={`timer ${remaining<=5?'urgent':''}`}><span aria-label={t('Seconds remaining','剩余秒数')}>{remaining}</span><div className="timer-track"><i style={{width:`${remaining/25*100}%`}}/></div></div><form onSubmit={e=>{e.preventDefault();answer();}}><label className="sr-only" htmlFor="answer">{t('Your answer','你的答案')}</label><input id="answer" ref={answerRef} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={120} value={input} onChange={e=>setInput(e.target.value)} onCompositionStart={()=>compose.current=true} onCompositionEnd={()=>compose.current=false} placeholder={t('type one answer…','输入一个答案…')}/><button className="pixel-button primary" disabled={!input.trim()} type="submit">{t('DIVE','下潜')} ↓</button></form><p className="input-hint">{t('Press Enter to dive · English or Chinese names','按回车下潜 · 可输入英文或中文名称')}</p></>}</div>}
    {isReveal&&<div className="reveal-actions"><div className="mini-tiers">{(['plankton','clever','schooler','rare','deep','krillion'] as Tier[]).map(key=><span className={result.tier===key?'active':''} key={key} style={{color:TIERS[key].color}}>{TIERS[key].score}<i/></span>)}</div><button className="pixel-button primary" onClick={()=>{const next=advance(current.current,Date.now());current.current=next;update(next);if(next.phase==='complete')playSound(p.sound,'finish');}}>{round===7?t('VIEW YOUR DIVE','查看本局成绩'):t('DESCEND','继续下潜')} ▼</button><button className="small-link" aria-expanded={showAnswers} onClick={()=>setShowAnswers(s=>!s)}>{t('EXPLORE ANSWERS','查看参考答案')} ({question.answers.length}) {showAnswers?'−':'+'}</button>{showAnswers&&<div className="answer-drawer"><h2>{p.language==='zh'?question.promptZh:question.prompt}</h2><AnswerList question={question}/></div>}</div>}
  </main>;
}
function AnswerList({question}:{question:Question}) {const t=useText();return <div className="accepted"><p className="quiet">{t('Explore answers and their scores.','发现更多答案，了解对应分数。')}</p>{question.answers.slice().sort((a,b)=>b.score-a.score).map(a=><div key={a.id}><span>{a.text}{a.aliases.some(s=>/[\u3400-\u9fff]/.test(s))&&<small>{a.aliases.find(s=>/[\u3400-\u9fff]/.test(s))}</small>}</span><b style={{color:TIERS[a.tier].color}}>+{a.score}</b></div>)}</div>;}
function Archive({bank,dives,start,home}:{bank:Bank;dives:Record<string,Dive>;start:(date:string)=>void;home:()=>void}) {
  const t=useText(),today=utcDate(),[date,setDate]=useState(today);const count=Math.min(90,Math.max(1,dayNumber(today)));
  const days=Array.from({length:count},(_,i)=>utcDate(new Date(Date.parse(today)-i*86400000)));
  return <main className="page-content"><PageHeading title={t('THE ARCHIVE','历史深潜')} subtitle={t('Return to an earlier day. A different ocean of answers.','返回过去的日期，探索另一组答案。')} home={home}/><form className="date-picker" onSubmit={e=>{e.preventDefault();if(isValidDate(date)&&date>=EPOCH&&date<=today)start(date);}}><label htmlFor="dive-date">{t('Choose a date','选择日期')}</label><input type="date" id="dive-date" min={EPOCH} max={today} value={date} onChange={e=>setDate(e.target.value)}/><button className="pixel-button primary" disabled={!date||date<EPOCH||date>today}>{t('DIVE','下潜')} ↓</button></form><div className="archive-grid">{days.map(day=>{const d=findDateDive(dives,day);return <button key={day} onClick={()=>start(day)}><small>{t('DIVE','深潜')} #{dayNumber(day)}</small><strong>{day.slice(5)}</strong><span>{d?.phase==='complete'?`${score(d)*10}m`:d?t('CONTINUE','继续'):t('PLAY','开始')} →</span></button>;})}</div><p className="quiet">{t(`Explore daily dives from ${EPOCH}, or keep practising in Unlimited.`,`可回顾 ${EPOCH} 起的每日挑战，也可前往无限模式继续练习。`)}</p></main>;
}
function QuestionLibrary({bank,home}:{bank:Bank;home:()=>void}) {
  const t=useText(),language=useContext(Lang),[search,setSearch]=useState(''),[pack,setPack]=useState('all'),[page,setPage]=useState(0);
  const filtered=bank.questions.filter(q=>(pack==='all'||q.pack===pack)&&`${q.prompt} ${q.promptZh} ${q.id}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="page-content"><PageHeading title={t('QUESTION LIBRARY','题库')} subtitle={t(`${bank.count.toLocaleString()} challenges · ${bank.categories} categories`,`${bank.count.toLocaleString()} 道挑战题 · ${bank.categories} 个分类`)} home={home}/><div className="bank-filters"><input aria-label={t('Search prompts','搜索题目')} placeholder={t('Search a prompt…','搜索题目…')} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/><select aria-label={t('Filter category','筛选分类')} value={pack} onChange={e=>{setPack(e.target.value);setPage(0);}}><option value="all">{t('All packs','全部主题')}</option>{Object.entries(packs).map(([id,p])=><option value={id} key={id}>{p[language==='zh'?1:0]}</option>)}</select></div><p className="quiet">{t('Explore category, letter and word-length challenges. For letter rules, use the English spelling shown in each answer list.','浏览分类、字母与词长挑战。遇到字母要求时，请以答案列表中的英文拼写为准。')}</p><div className="question-list">{filtered.slice(page*20,page*20+20).map(q=><details key={q.id}><summary>{language==='zh'?q.promptZh:q.prompt}<small>{q.answers.length} {t('answers to explore','个参考答案')}</small></summary><AnswerList question={q}/></details>)}</div>{!filtered.length&&<p>{t('No prompts match your search.','没有找到匹配的题目。')}</p>}<nav className="pagination" aria-label={t('Question pages','题库分页')}><button disabled={page===0} onClick={()=>{setPage(n=>n-1);window.scrollTo({top:0,behavior:'auto'});}}>←</button><span>{page+1} / {Math.max(1,Math.ceil(filtered.length/20))} · {filtered.length}</span><button disabled={(page+1)*20>=filtered.length} onClick={()=>{setPage(n=>n+1);window.scrollTo({top:0,behavior:'auto'});}}>→</button></nav></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
