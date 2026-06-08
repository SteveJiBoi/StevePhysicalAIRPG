const fs=require('fs'); const vm=require('vm');
let engine=fs.readFileSync('_engine.js','utf8');
// expose internals for testing
engine += "\n;globalThis.__api={NODES,getNode,xpReq,awardXP,awardCredits,architectUnlocked,classForLevel,isCompleted,prereqsMet,nodeState,completeNode,CAPSTONES,TARGETS,hashStr,mulberry32,MISSION_POOLS,MISSION_ORDER,reqMet,getState:()=>S,setState:(v)=>{S=v}};";

// ---- minimal DOM stubs ----
function fakeEl(){ return new Proxy({
  style:{setProperty(){},removeProperty(){}}, classList:{add(){},remove(){},toggle(){}}, dataset:{}, children:[],
  appendChild(){}, remove(){}, addEventListener(){}, removeEventListener(){},
  getBoundingClientRect:()=>({left:0,top:0,width:0,height:0}),
  querySelectorAll:()=>[], setAttribute(){}, focus(){}, click(){},
  set innerHTML(v){}, get innerHTML(){return '';},
  set textContent(v){}, get textContent(){return '';},
  set value(v){}, get value(){return '';},
}, { get(t,p){ if(p in t) return t[p]; return undefined; }, set(t,p,v){ t[p]=v; return true; } }); }
const store={};
const ctx={
  console,
  localStorage:{ getItem:k=>store[k]||null, setItem:(k,v)=>store[k]=v, removeItem:k=>{delete store[k];} },
  document:{ readyState:'loading', getElementById:()=>fakeEl(), querySelectorAll:()=>[], addEventListener(){}, createElement:()=>fakeEl(), body:fakeEl() },
  window:{ addEventListener(){}, innerWidth:1200, innerHeight:800, scrollTo(){}, lucide:undefined },
  navigator:{ clipboard:{ writeText:()=>Promise.resolve() } },
  requestAnimationFrame:(f)=>{}, setTimeout:(f)=>0, clearTimeout(){}, setInterval:()=>0, clearInterval(){},
  Date, Math, JSON, Object, Array, String, Number, btoa:s=>Buffer.from(s,'binary').toString('base64'),
  encodeURIComponent, decodeURIComponent, fetch:()=>Promise.resolve({ok:false,json:()=>Promise.resolve({})}),
};
ctx.globalThis=ctx; ctx.window.lucide=undefined;
vm.createContext(ctx);
vm.runInContext(engine, ctx);
const A=ctx.__api;
let pass=0, fail=0;
function ok(c,m){ if(c){pass++;} else {fail++; console.log('  FAIL:',m);} }

// 1) leveling math
ok(A.xpReq(18)===7636, 'xpReq(18) should be 7636, got '+A.xpReq(18));
ok(A.xpReq(1)===100, 'xpReq(1)=100, got '+A.xpReq(1));
ok(A.xpReq(20)===Math.floor(100*Math.pow(20,1.5)), 'xpReq(20)');

// 2) data integrity: unique ids, prereqs exist
const ids=A.NODES.map(n=>n.id);
ok(new Set(ids).size===ids.length, 'node ids unique');
let badPre=[];
A.NODES.forEach(n=>(n.prereq||[]).forEach(p=>{ if(!A.getNode(p)) badPre.push(n.id+'->'+p); }));
ok(badPre.length===0, 'all prereq ids resolve: '+badPre.join(','));
ok(A.CAPSTONES.every(id=>A.getNode(id)), 'all capstones exist');
// targets reference valid nodes
let badT=[]; A.TARGETS.forEach(t=>t.req.forEach(r=>{ if(r.node && !A.getNode(r.node)) badT.push(t.id+'->'+r.node); }));
ok(badT.length===0, 'target node refs valid: '+badT.join(','));

// 3) seeded RNG determinism
const r1=A.mulberry32(A.hashStr('phys-ai-mission-2026-06-08'))();
const r2=A.mulberry32(A.hashStr('phys-ai-mission-2026-06-08'))();
ok(r1===r2, 'seeded RNG deterministic');
ok(r1!==A.mulberry32(A.hashStr('phys-ai-mission-2026-06-09'))(), 'different date -> different seed');

// 4) dependency logic on fresh state
let S=A.getState();
ok(A.nodeState(A.getNode('math_la'))==='unlocked', 'math_la unlocked at start');
ok(A.nodeState(A.getNode('rob_kin'))==='locked', 'rob_kin locked at start');
ok(A.nodeState(A.getNode('res_lit'))==='unlocked', 'research unlocked at start');
ok(A.nodeState(A.getNode('hub'))==='unlocked', 'hub unlocked at start');

// 5) complete all math+physics -> rob_kin unlocks
['math_la','math_calc','math_prob','math_opt','phys_mech','phys_elec','phys_signals'].forEach(id=>{S.completed[id]=true;});
ok(A.prereqsMet(A.getNode('rob_kin'))===true, 'rob_kin prereqs met after math+physics');
ok(A.nodeState(A.getNode('rob_kin'))==='unlocked', 'rob_kin now unlocked');
ok(A.nodeState(A.getNode('ros_core'))==='locked', 'ros still locked (needs cs+rob_kin)');

// 6) architect logic
ok(A.architectUnlocked()===false, 'architect not yet');
A.CAPSTONES.forEach(id=>{ const n=A.getNode(id); if(n.counter){ S.research[n.counter]=n.goal; } else { S.completed[id]=true; } });
ok(A.architectUnlocked()===true, 'architect unlocked after all capstones');
ok(A.classForLevel()==='Physical AI Architect', 'class becomes Architect');
ok(A.nodeState(A.getNode('hub'))==='mastered', 'hub mastered when architect');

// 7) awardXP leveling loop
S.level=18; S.xp=0; S.totalXp=0; S.xpHistory={};
A.awardXP(8000);  // > xpReq(18)=7636 -> level to 19
ok(S.level===19, 'level up to 19 after 8000 xp, got '+S.level);
ok(S.xp===8000-7636, 'xp remainder correct, got '+S.xp);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
