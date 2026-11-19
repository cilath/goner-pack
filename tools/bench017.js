/* GONER PACK 017: замер на реальных фото предчеков (tests/fixtures/real017). Сравнивает версии нейросетевого распознавания:
     node tools/bench017.js 016        — код версии 016 (берётся из git, коммит fc7626e), справочник 016
     node tools/bench017.js 017        — текущий код
   Параметры: --dict=016|cur (какой справочник: 192 записи 016 или текущий), --prices=none|loo (цены не известны / известны из ДРУГИХ чеков,
   «исключая этот» — так цены не подсказывают ответ на проверяемом чеке), --only=1044917, --json=файл.
   Метрики считает lab-score.js (как OCR LAB) + строгий разбор: какие позиции потребуют ручного исправления. Эталон в распознавание не попадает. */
const fs=require('fs'),path=require('path'),cp=require('child_process'),os=require('os');
const ROOT=path.join(__dirname,'..'),FIX=path.join(ROOT,'tests/fixtures/real017');
const ARGS=require.main===module?Object.fromEntries(process.argv.slice(2).map(a=>a.startsWith('--')?a.slice(2).split('='):['ver',a])):{};
const BASE016='fc7626e';
function codeDir(ver){if(ver!=='016')return ROOT;const d=path.join(os.tmpdir(),'goner-pack-016');fs.mkdirSync(d,{recursive:true});
 for(const f of['imgproc.js','parser.js','matcher.js','pipeline.js','neural.js','dict-seed.js','lab-score.js'])fs.writeFileSync(path.join(d,f),cp.execSync(`git show ${BASE016}:${f}`,{cwd:ROOT}));return d}
async function main(args){args=args||ARGS;const VER=args.ver||'017',log=args.quiet?()=>{}:console.log;const dir=codeDir(VER),R=require(path.join(ROOT,'tests/ort-runner.js')),{runner,keys}=await R.load();
 const req=f=>require(path.join(dir,f)),NEURAL=req('neural.js'),PIPE=req('pipeline.js'),GPM=req('matcher.js'),GP=req('parser.js'),LS=req('lab-score.js');
 const dictMode=args.dict||(VER==='016'?'016':'cur'),seed=dictMode==='016'?require(path.join(codeDir('016'),'dict-seed.js')):require(path.join(ROOT,'dict-seed.js'));
 const GPD=require(path.join(ROOT,'dict.js')),dict=GPD.build(seed.items,[]),idx=GPM.index(dict),match=n=>GPM.match(n,idx);
 const T=JSON.parse(fs.readFileSync(path.join(FIX,'truth.json'),'utf8'));delete T._about;
 const ids=Object.keys(T).filter(k=>!args.only||args.only.split(',').some(o=>k.startsWith(o)));
 const has017=VER!=='016'&&fs.existsSync(path.join(ROOT,'review.js'));const GPR=has017?require(path.join(ROOT,'review.js')):null;
 const key=n=>{const m=match(n);return m.st==='o'?m.name:String(n||'').toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9]/g,'')};
 /* цены «из других чеков»: цена за единицу блюда по эталонам всех чеков, кроме проверяемого (и кроме второго фото того же чека) */
 const pricesFor=id=>{if(args.prices!=='loo')return[];const no=T[id].no,P=new Map();for(const[k,t]of Object.entries(T)){if(t.no===no)continue;for(const x of t.items)if(x.kind!=='cutlery'){const m=match(x.name);if(m.st!=='o')continue;const dk=m.d.k;P.set(dk,{k:dk,name:m.d.n,unit:+(x.sum/x.qty).toFixed(2),t:Date.parse('2026-11-18')})}}return[...P.values()]};
 const rows=[];
 for(const id of ids){const t=T[id];let file=path.join(FIX,t.file);
  /* --degrade=1: то же фото хуже — 45 % размера, размытие, JPEG 35 (как плохая камера / сжатие мессенджером) */
  if(args.degrade){const sharp=require('sharp'),m=await sharp(file).metadata(),tmp=path.join(os.tmpdir(),'gp-deg-'+id+'.jpg');await sharp(file).resize(Math.round(m.width*.45)).blur(1.1).jpeg({quality:35}).toFile(tmp);file=tmp}
  const src=await R.image(file),t0=Date.now();let nr,res;
  try{nr=await NEURAL.recognize(src,{runner,keys,...(args.skewMin?{skewMin:+args.skewMin}:{}),...(args.rect==='0'?{rect:false}:{})});res=PIPE.fromNeural(nr,{match,dict:args.ctc==='0'?null:dict,idx});if(PIPE.refineNeural&&args.refine!=='0')await PIPE.refineNeural(res,nr,{match,dict})}catch(e){console.error(id,e);continue}
  const ms=Date.now()-t0,p=res.parsed;
  /* экран проверки: 016 — справочник по тексту (recheck 016 без обученных правил); 017 — review.js (то же, что app.js) */
  if(GPR)GPR.review(p,{idx,dict,rules:[],prices:pricesFor(id),matcher:GPM});
  else p.items.forEach(x=>{if(x.kind==='cutlery'){x.st='o';return}x.ocr=x.name;const m=match(x.name);x.st=m.st;if(m.st==='o'&&m.name!==x.name){x.fixed=x.name;x.name=m.name}});
  const sc=LS.score(p,t,{match,needsOk:(x)=>GP.needsOk(x,true)});
  /* строгий разбор по строкам: строка эталона ↔ позиция с той же суммой (иначе по названию) */
  const dish=p.items.filter(x=>x.kind==='dish'),used=new Set(),det=[];let wrongName=0,wrongAuto=0,qtyBad=0,missing=0,taps=0,edits=0,auto=0;
  for(const w of t.items.filter(x=>x.kind!=='cutlery')){let k=dish.findIndex((x,i)=>!used.has(i)&&x.sum!=null&&Math.abs(x.sum-w.sum)<.005);if(k<0)k=dish.findIndex((x,i)=>!used.has(i)&&key(x.name)===key(w.name));
   if(k<0){missing++;edits++;det.push(`  ✗ нет строки: ${w.name} ×${w.qty}`);continue}used.add(k);const x=dish[k],nOk=key(x.name)===key(w.name),qOk=x.qty===w.qty,need=GP.needsOk(x,true);
   if(!nOk){wrongName++;if(x.st==='o'&&!need)wrongAuto++}if(!qOk)qtyBad++;if(!nOk||!qOk)edits++;else if(need)taps++;if(x.st==='o'&&nOk)auto++;
   det.push(`  ${nOk&&qOk?(need?'◐':'✓'):'✗'} ${w.name} ×${w.qty} → «${x.name}» ×${x.qty} [${x.st}${x.how?'/'+x.how:''}]${x.nn?` nn:${x.nn.dec} free${x.nn.gapFree} gap2 ${x.nn.gap2} «${x.nn.cands.map(c=>c.n+' '+c.s).join(' | ')}»${x.nn.rereads?' rr'+x.nn.rereads+'('+x.nn.before+')':''}`:''}${x.qconf!=null?' q'+x.qconf:''}${x.ocr&&x.ocr!==x.name?' OCR «'+x.ocr+'»':''}${need?' нужна проверка: '+(GP.hard(x).join('; ')||'не в справочнике'):''}`)}
  const extra=dish.filter((x,i)=>!used.has(i));extra.forEach(x=>det.push(`  + лишняя: «${x.name}» ×${x.qty} ${x.sum}`));edits+=extra.length;
  const cutOk=sc.cut;const tm={det:Math.round(nr.ms.det||0),rec:Math.round(nr.ms.rec||0),col:Math.round(nr.ms.col||0),ctc:res.ctcMs||0,reread:res.refineMs||0};rows.push({id,ms,tm,want:sc.want,ok:sc.ok,qtyErr:sc.qtyErr,manual:sc.manual,total:sc.total,no:sc.no,ex:sc.ex,cutOk,wrongName,wrongAuto,qtyBad,missing,extra:extra.length,taps,edits,auto,det});
  log(`${id}: блюд ${sc.ok}/${sc.want} (lab-score) · кол-во ошибок ${sc.qtyErr} · ручных подтв. ${sc.manual} · правок ${edits} · неверных автоподстановок ${wrongAuto} · итог ${sc.total?'✓':'✗'} · №${sc.no?'✓':'✗'} ID${sc.ex?'✓':'✗'} приборы${cutOk?'✓':'✗'} · ${(ms/1000).toFixed(1)} с`);
  if(args.v)det.forEach(l=>log(l))}
 const S=k=>rows.reduce((a,r)=>a+(typeof r[k]==='boolean'?+r[k]:r[k]),0);
 const sum={ver:VER,dict:dictMode,prices:args.prices||'none',photos:rows.length,want:S('want'),ok:S('ok'),qtyErr:S('qtyErr'),manual:S('manual'),edits:S('edits'),taps:S('taps'),wrongName:S('wrongName'),wrongAuto:S('wrongAuto'),missing:S('missing'),extra:S('extra'),auto:S('auto'),total:S('total'),no:S('no'),ex:S('ex'),cut:S('cutOk'),msAvg:Math.round(S('ms')/rows.length),tmAvg:Object.fromEntries(['det','rec','col','ctc','reread'].map(k=>[k,Math.round(rows.reduce((a,r)=>a+((r.tm||{})[k]||0),0)/rows.length)])),msMax:Math.max(...rows.map(r=>r.ms))};
 log('\nИТОГО',JSON.stringify(sum));if(args.json)fs.writeFileSync(args.json,JSON.stringify({sum,rows},null,1));return{sum,rows}}
if(require.main===module)main();else module.exports={run:main};
