/* GONER PACK 013→017: Neural OCR — PaddleOCR PP-OCRv5 (детектор строк PP-OCRv5_mobile_det + распознаватель eslav_PP-OCRv5_mobile_rec,
   русский/украинский/белорусский + латиница и цифры). Лицензия моделей Apache-2.0.
   Модуль не зависит от среды выполнения нейросети: ему передаётся runner = {det(data,dims)→Float32Array, rec(data,dims)→{data,dims}}.
   В браузере runner — onnxruntime-web (neural-web.js), в тестах — тот же onnxruntime-web в Node (tests/ort-runner.js).
   017:
   - распознаватель возвращает не только текст, но и матрицу вероятностей каждой строки (сжатый алфавит, ctc.js) и положение каждого кадра на фото;
   - рамки, где детектор слил две соседние строки (цифры сумм вплотную), разрезаются по провалу профиля;
   - наклон берётся по наклону самих рамок строк; строки собираются с учётом ЛОКАЛЬНОГО наклона (изогнутый чек: название и числа одной строки
     не уезжают в соседнюю строку); каждая наклонная рамка выпрямляется перед чтением; фото, повёрнутое на 90°, разворачивается;
   - колонка количества: по заголовку «Наименование / Кол-в / Сумма» и строкам таблицы определяются x-границы, ячейка количества вырезается и
     читается отдельно только по цифрам и точке, шаблон «N.0»;
   - reread(): повторное чтение трудных строк с другим вырезом (запас по высоте «как 64 px», контраст, сдвиг). */
(function(r,f){const nd=typeof require==='function'&&typeof module==='object',m=f(nd?require('./imgproc.js'):r.IMG,nd?require('./ctc.js'):r.GPCTC);if(nd&&module.exports)module.exports=m;else r.NEURAL=m})(typeof self!=='undefined'?self:this,function(IMG,CTC){
const DET_MEAN=[.485,.456,.406],DET_STD=[.229,.224,.225];
const now=()=>(typeof performance!=='undefined'?performance.now():Date.now());
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[s.length>>1]:0};
/* ---------- детектор ---------- */
function prepDet(g,long){const k=Math.min(1,long/Math.max(g.w,g.h)),w=Math.max(32,Math.round(g.w*k/32)*32),h=Math.max(32,Math.round(g.h*k/32)*32),s=IMG.resize(g,w,h),n=w*h,x=new Float32Array(3*n);
 for(let i=0;i<n;i++){const v=s.d[i]/255;x[i]=(v-DET_MEAN[0])/DET_STD[0];x[n+i]=(v-DET_MEAN[1])/DET_STD[1];x[2*n+i]=(v-DET_MEAN[2])/DET_STD[2]}
 return{x,dims:[1,3,h,w],w,h,kx:w/g.w,ky:h/g.h}}
/* статистика пикселей компоненты id в полосе строк [ya,yb): рамка, площадь, средняя вероятность, наклон (по вторым моментам) */
function stat(prob,lab,w,id,x0,x1,ya,yb){let a=0,sc=0,mx=0,my=0,mxx=0,myy=0,mxy=0,X0=1e9,X1=-1,Y0=1e9,Y1=-1;
 for(let y=ya;y<yb;y++)for(let x=x0;x<=x1;x++){const q=y*w+x;if(lab[q]!==id)continue;a++;sc+=prob[q];mx+=x;my+=y;mxx+=x*x;myy+=y*y;mxy+=x*y;if(x<X0)X0=x;if(x>X1)X1=x;if(y<Y0)Y0=y;if(y>Y1)Y1=y}
 if(!a)return null;mx/=a;my/=a;const cxx=mxx/a-mx*mx,cyy=myy/a-my*my,cxy=mxy/a-mx*my;return{x0:X0,y0:Y0,x1:X1+1,y1:Y1+1,a,score:sc/a,ang:.5*Math.atan2(2*cxy,cxx-cyy)*180/Math.PI}}
/* компоненты связности карты вероятностей. 017: компонента выше 1.75 медианной высоты строки (две строки чека слиплись — частый случай для
   колонки сумм, напечатанной вплотную) разрезается по провалам горизонтального профиля. */
function components(prob,w,h,thr,o){const lab=new Int32Array(w*h),out=[],st=new Int32Array(w*h);let id=0;
 for(let p=0;p<w*h;p++){if(lab[p]||prob[p]<=thr)continue;id++;let sp=0;st[sp++]=p;lab[p]=id;let x0=w,y0=h,x1=0,y1=0;
  while(sp){const q=st[--sp],x=q%w,y=(q/w)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
   if(x>0&&!lab[q-1]&&prob[q-1]>thr){lab[q-1]=id;st[sp++]=q-1}if(x<w-1&&!lab[q+1]&&prob[q+1]>thr){lab[q+1]=id;st[sp++]=q+1}
   if(y>0&&!lab[q-w]&&prob[q-w]>thr){lab[q-w]=id;st[sp++]=q-w}if(y<h-1&&!lab[q+w]&&prob[q+w]>thr){lab[q+w]=id;st[sp++]=q+w}}
  const s=stat(prob,lab,w,id,x0,x1,y0,y1+1);if(s){s.id=id;out.push(s)}}
 if(o&&o.split===false)return out;
 const hs=out.filter(c=>c.a>=20&&c.x1-c.x0>c.y1-c.y0).map(c=>c.y1-c.y0),hm=med(hs);if(!hm)return out;const res=[];
 for(const c of out){const bh=c.y1-c.y0;if(bh<1.75*hm||bh<8){res.push(c);continue}
  const cnt=new Float64Array(bh);for(let y=c.y0;y<c.y1;y++){let n=0;for(let x=c.x0;x<c.x1;x++)if(lab[y*w+x]===c.id)n++;cnt[y-c.y0]=n}
  const mx=Math.max(...cnt),tv=.5*mx,runs=[];let s=-1;for(let y=0;y<=bh;y++){const on=y<bh&&cnt[y]>=tv;if(on&&s<0)s=y;if(!on&&s>=0){runs.push([s,y]);s=-1}}
  const good=runs.filter(r=>r[1]-r[0]>=Math.max(2,.3*hm));if(good.length<2){res.push(c);continue}
  const cuts=[0];for(let i=1;i<good.length;i++){let by=good[i-1][1],bv=1e9;for(let y=good[i-1][1];y<good[i][0];y++)if(cnt[y]<bv){bv=cnt[y];by=y}cuts.push(by)}cuts.push(bh);
  for(let i=0;i<cuts.length-1;i++){const p=stat(prob,lab,w,c.id,c.x0,c.x1-1,c.y0+cuts[i],c.y0+cuts[i+1]);if(p){p.split=true;res.push(p)}}}
 return res}
function detBoxes(prob,P,o){o=o||{};const C=components(prob,P.w,P.h,o.thresh||.3,o),B=[];
 for(const c of C){const bw=c.x1-c.x0,bh=c.y1-c.y0;if(bh<3||c.a<4||c.score<(o.boxThresh||.6))continue;   /* узкая «1» в «1.0» бывает шириной 1–2 px: по ширине не отсекаем */
  const d=c.a*(o.unclip||1.6)/(2*(bw+bh)),dx=d+.25*bh;   // расширение рамки (как unclip в PaddleOCR) + запас по ширине: тонкая «1» в «1.0»
  B.push({rx0:c.x0/P.kx,rx1:c.x1/P.kx,x0:(c.x0-dx)/P.kx,y0:(c.y0-d)/P.ky,x1:(c.x1+dx)/P.kx,y1:(c.y1+d)/P.ky,ty0:c.y0/P.ky,ty1:c.y1/P.ky,score:c.score,ang:c.ang,wide:bw>4*bh,split:!!c.split})}
 return B}
/* наклон по проекционному профилю карты вероятностей (013). В 017 — запасной способ, если широких рамок мало. */
function skewAngle(prob,w,h,o){o=o||{};const pts=[];for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2)if(prob[y*w+x]>.3)pts.push(x,y);if(pts.length<200)return 0;
 const score=a=>{const r=a*Math.PI/180,s=Math.sin(r),c=Math.cos(r),off=w*Math.abs(s)+2,H=new Float64Array(Math.ceil(h+2*off)+2);for(let i=0;i<pts.length;i+=2){const yy=(pts[i+1]*c-pts[i]*s+off)/2;H[yy|0]++}let v=0;for(let i=0;i<H.length;i++)v+=H[i]*H[i];return v};
 let best=0,bv=-1;for(let a=-(o.max||10);a<=(o.max||10)+1e-9;a+=.5){const v=score(a);if(v>bv){bv=v;best=a}}
 for(let a=best-.4;a<=best+.4+1e-9;a+=.1){const v=score(a);if(v>bv){bv=v;best=a}}return Math.round(best*10)/10}
/* 017: наклон по самим рамкам строк (медиана угла широких рамок). Положительный — строка идёт вниз вправо; IMG.rotate(g, −угол) выпрямляет. */
function boxSkew(B){const W=B.filter(b=>b.wide&&Math.abs(b.ang)<15);return W.length>=8?Math.round(med(W.map(b=>b.ang))*10)/10:null}
/* поворот на 90° без потерь: dir=1 — по часовой */
function rot90(g,dir){const w=g.w,h=g.h,o=new Uint8ClampedArray(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=g.d[y*w+x];if(dir>0)o[x*h+(h-1-y)]=v;else o[(w-1-x)*h+y]=v}return{w:h,h:w,d:o}}
/* ---------- распознаватель ---------- */
/* decode: жадный CTC (как 013) + (017) по запросу матрица лог-вероятностей в сжатом алфавите и номер кадра каждой выданной буквы */
function decode(out,dims,keys,o){const[n,T,C]=dims,res=[],map=o&&o.mat?CTC.colMap(keys):null;for(let b=0;b<n;b++){let s='',last=0,cs=[],cf=[];const base=b*T*C;
  for(let t=0;t<T;t++){let bi=0,bv=-1;const q=base+t*C;for(let c=0;c<C;c++){const v=out[q+c];if(v>bv){bv=v;bi=c}}if(bi!==0&&bi!==last){const ch=keys[bi-1]||(bi===keys.length+1?' ':'');if(ch){s+=ch;cs.push(bv);cf.push(t)}}last=bi}
  const r={text:s,conf:cs.length?cs.reduce((a,v)=>a+v,0)/cs.length:0,min:cs.length?Math.min(...cs):0};if(map){r.m={lp:CTC.reduce(out,base,T,C,map),T};r.cf=cf}res.push(r)}return res}
/* вырез строки для распознавателя. 017: широкая наклонная рамка выпрямляется по своему углу; варианты для повторного чтения:
   pad — запас по высоте ×1.33 (как высота 64 вместо 48 при той же высоте входа модели 48), contrast — растяжка контраста, shift — сдвиг на 12 % высоты.
   К картинке добавляются fx0/fk: x кадра t на фото = fx0 + (t + 0.5)·fk. */
function recInput(g,b,H,o){o=o||{};let bx0=b.x0,bx1=b.x1,by0=b.y0,by1=b.y1;const bh=by1-by0;
 if(o.pad){const e=bh*(o.pad-1)/2;by0-=e;by1+=e}if(o.shift){by0+=o.shift*bh;by1+=o.shift*bh}
 const x0=Math.max(0,Math.floor(bx0)),y0=Math.max(0,Math.floor(by0)),x1=Math.min(g.w,Math.ceil(bx1)),y1=Math.min(g.h,Math.ceil(by1));if(x1-x0<2||y1-y0<2)return null;
 let c=IMG.crop(g,x0,y0,x1,y1),off=0;const a=b.ang||0;
 if(o.rect!==false&&b.wide&&Math.abs(a)>=1.2&&Math.abs(a)<15){const r=IMG.rotate(c,-a),th=Math.max(.45*c.h,c.h-c.w*Math.abs(Math.tan(a*Math.PI/180))),cy=r.h/2;
  const k=IMG.crop(r,0,Math.max(0,cy-th/2-.08*th),r.w,Math.min(r.h,cy+th/2+.08*th));off=(r.w-c.w)/2;c=k}
 if(o.contrast)c=IMG.stretch(c,.05);
 const W=Math.max(16,Math.min(2400,Math.round(c.w*H/c.h/8)*8)),im=IMG.resize(c,W,H);im.fx0=x0-off;im.fk=8*c.w/W;return im}
async function recognizeBoxes(g,B,runner,keys,o){o=o||{};const H=48,items=B.map((b,i)=>({b,i,im:recInput(g,b,H,o)})).filter(z=>z.im).sort((a,b)=>a.im.w-b.im.w),out=new Array(B.length);let ms=0,calls=0;
 for(let s=0;s<items.length;s++){/* модель сконвертирована с батчем 1: единица зашита во внутренних Reshape */const z=items[s],im=z.im,W=im.w,x=new Float32Array(H*W*3);
  for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){const v=(im.d[y*W+xx]-127.5)/127.5,q=(y*W+xx)*3;x[q]=x[q+1]=x[q+2]=v}
  const t0=now(),r=await runner.rec(x,[1,H,W,3]);ms+=now()-t0;calls++;const d=decode(r.data,r.dims,keys,{mat:o.mat!==false})[0];d.fx0=im.fx0;d.fk=im.fk;out[z.i]=d;if(o.onProgress)o.onProgress((s+1)/items.length)}
 return{res:out,ms,calls}}
/* ---------- раскладка: область чека, строки, текст ---------- */
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.min(s.length-1,Math.max(0,Math.round(p*(s.length-1))))]:0};
const tan=d=>Math.tan(d*Math.PI/180);
/* 017: строки собираются с учётом локального наклона: продолжение строки ищется там, где его предсказывает наклон уже найденных рамок
   (у широкой рамки — собственный угол, у узкой — медиана широких рамок по соседству). Так на изогнутом чеке название не попадает
   в одну строку с количеством и суммой соседней строки (чек 1044947: сдвиг был ровно на строку). */
function layout(items,o){o=o||{};const L=items.filter(z=>z.text&&z.text.trim());if(!L.length)return{lines:[],text:'',region:null};
 // область чека: по уверенным словам из ≥3 букв/цифр; посторонний текст рядом (упаковка, этикетки) отбрасывается
 const core=L.filter(z=>z.conf>=.8&&z.text.replace(/[^а-яёa-z0-9]/gi,'').length>=3);const C=core.length>=5?core:L;
 const lx=pct(C.map(z=>z.x0),.1),rx=pct(C.map(z=>z.x1),.9),mg=.06*(rx-lx),region={x0:lx-mg,x1:rx+mg};
 let In=L.filter(z=>{const c=(z.x0+z.x1)/2;return c>=region.x0&&c<=region.x1});
 const hs=In.map(z=>z.y1-z.y0).sort((a,b)=>a-b),hm=hs[hs.length>>1]||20;
 /* 017: крошечный обрывок (точка грязи, «c» высотой в четверть строки между количеством и суммой) строкой не считается */
 In=In.filter(z=>!(z.y1-z.y0<.45*hm&&z.text.trim().length<=2&&z.conf<.8));
 const ovl=(a,b)=>{const ax0=a.rx0??a.x0,ax1=a.rx1??a.x1,bx0=b.rx0??b.x0,bx1=b.rx1??b.x1,o=Math.min(ax1,bx1)-Math.max(ax0,bx0);return o<=0?0:o/Math.max(1,Math.min(ax1-ax0,bx1-bx0))};
 const W=In.filter(z=>z.wide&&z.ang!=null&&Math.abs(z.ang)<15),gs=W.length?tan(med(W.map(z=>z.ang))):0;
 In.forEach(z=>{z.xc=((z.rx0??z.x0)+(z.rx1??z.x1))/2;z.yc=(z.y0+z.y1)/2});
 const slope=z=>{if(o.flat)return 0;if(z.wide&&z.ang!=null&&Math.abs(z.ang)<15)return tan(z.ang);const nb=W.filter(q=>Math.abs(q.yc-z.yc)<4*hm);return nb.length>=2?tan(med(nb.map(q=>q.ang))):gs};
 In.forEach(z=>{z.sl=slope(z)});
 const rows=[];
 for(const z of[...In].sort((a,b)=>(a.rx0??a.x0)-(b.rx0??b.x0))){let best=null,bd=1e9;
  for(const R of rows){const q=R.w[R.w.length-1],s=(q.sl+z.sl)/2,d=Math.abs(q.yc+s*(z.xc-q.xc)-z.yc);if(d<bd&&d<=.45*hm&&!R.w.some(p=>ovl(p,z)>.6)){bd=d;best=R}}
  if(best)best.w.push(z);else rows.push({w:[z]})}
 // строки упорядочиваются по высоте в общей точке отсчёта (середина чека) с учётом наклона
 const xr=(region.x0+region.x1)/2;rows.forEach(R=>{const q=R.w.reduce((a,b)=>(b.x1-b.x0)>(a.x1-a.x0)?b:a);R.sl=q.sl;R.yr=q.yc+q.sl*(xr-q.xc)});rows.sort((a,b)=>a.yr-b.yr);
 const lines=rows.map(R=>{R.w.sort((a,b)=>a.x0-b.x0);let t='';R.w.forEach((z,i)=>{let tx=z.text.trim();if(i){const q=R.w[i-1],gap=(z.rx0??z.x0)-(q.rx1??q.x1);if(gap<.25*hm){if(/[.,]$/.test(t)&&/^[.,]/.test(tx))tx=tx.slice(1);/* «11.» + «.77» → «11.77», «1» + «.0» → «1.0» */}else t+=gap>1.2*hm?'   ':' '}t+=tx});
  return{text:t,conf:R.w.reduce((a,z)=>a+z.conf,0)/R.w.length,x0:Math.min(...R.w.map(z=>z.x0)),y0:Math.min(...R.w.map(z=>z.y0)),x1:Math.max(...R.w.map(z=>z.x1)),y1:Math.max(...R.w.map(z=>z.y1)),slope:R.sl,
   parts:R.w.map(z=>({text:z.text,conf:z.conf,x0:z.x0,y0:z.y0,x1:z.x1,y1:z.y1,rx0:z.rx0,rx1:z.rx1,ang:z.ang,wide:z.wide,sl:z.sl,m:z.m,cf:z.cf,fx0:z.fx0,fk:z.fk}))}});
 return{lines,text:lines.map(l=>l.text).join('\n'),region,hm}}
/* ---------- 017: колонка количества ---------- */
const TOT=/итог|сумма\s*сч|скидк|оплат|эконом/i,HDR=l=>/наимен/i.test(l)||/кол[\s\S]{0,3}в/i.test(l)&&/сумм/i.test(l);
const xOf=(p,t)=>p.fx0+(t+.5)*p.fk;
const isQtyTok=s=>/^[^\dа-яёa-z]?\d{1,2}[.,:]\d?[^\dа-яёa-z]{0,2}$/i.test(String(s).trim()),isQtyFull=s=>/^\d{1,2}[.,]\d$/.test(String(s).trim());
const isSumTok=s=>/\d{1,5}\s?[.,:;]\s?\d/.test(s)&&!/[а-яё]{2}/i.test(s);
/* кадры части, попадающие в отрезок x ∈ [a,b) */
function framesIn(p,a,b){if(!p.m)return null;const t0=Math.ceil((a-p.fx0)/p.fk-.5),t1=Math.floor((b-p.fx0)/p.fk-.5)+1;return CTC.slice(p.m,t0,t1)}
function tableOf(lines){let hi=-1;for(let i=0;i<lines.length;i++)if(HDR(lines[i].text)){hi=i;break}if(hi<0)return null;
 /* заголовок мог разделиться на две строки («Наименование» / «Кол-в Сумма») */
 let hp=null,hl=hi;for(const i of[hi,hi+1])if(lines[i])for(const p of lines[i].parts)if(/кол/i.test(p.text)){hp=p;hl=Math.max(hl,i)}
 let end=lines.length;for(let i=hl+1;i<lines.length;i++)if(TOT.test(lines[i].text)){end=i;break}
 let qx=null;if(hp&&hp.cf){const k=hp.text.search(/кол/i),v=hp.text.slice(k).search(/в/i);if(k>=0&&hp.cf[k]!=null){const e=v>0&&hp.cf[k+v]!=null?hp.cf[k+v]:hp.cf[Math.min(hp.cf.length-1,k+4)];qx=[xOf(hp,hp.cf[k]),xOf(hp,e)+.5*hp.fk]}}
 return{hi,hl,end,qx}}
async function qtyColumn(g,lines,runner,keys,hm,o){const tb=tableOf(lines);if(!tb)return{found:false};const rows=[];let ms=0,calls=0;
 for(let i=tb.hl+1;i<tb.end&&rows.length<45;i++){const l=lines[i],P=[...l.parts].sort((a,b)=>a.x0-b.x0);let s=null;for(let k=P.length-1;k>=0;k--)if(isSumTok(P[k].text)){s=P[k];break}
  let q=null;if(s){const k=P.indexOf(s);if(k>0&&isQtyTok(P[k-1].text))q=P[k-1]}rows.push({i,l,s,q})}
 /* x-границы ячейки количества: от правого края суммы (числа выровнены по правому краю) по строкам, где количество — отдельная рамка; иначе — по заголовку */
 const cal=rows.filter(r=>r.s&&r.q&&isQtyFull(r.q.text)).map(r=>{const H=r.s.y1-r.s.y0;return[(r.s.rx1-r.q.rx0)/H,(r.s.rx1-r.q.rx1)/H]}),off=cal.length>=2?[med(cal.map(c=>c[0])),med(cal.map(c=>c[1]))]:null;
 const out={found:true,header:!!tb.qx,calibrated:!!off,rows:0};
 for(const r of rows){const ref=r.s||r.l.parts.reduce((a,b)=>b.x1>a.x1?b:a),H=ref.y1-ref.y0;let cx0,cx1;
  if(off&&r.s){cx0=r.s.rx1-off[0]*H-.45*H;cx1=r.s.rx1-off[1]*H+.3*H;if(r.q&&/\d\d/.test(r.q.text))cx0-=.65*H}
  else if(tb.qx){cx0=tb.qx[0]-.3*H;cx1=tb.qx[1]+.3*H}else continue;
  if(cx1-cx0<.5*H)continue;const xc=(cx0+cx1)/2,sl=ref.sl||0,yc=(ref.y0+ref.y1)/2+sl*(xc-(ref.rx0+ref.rx1)/2),box={x0:cx0,x1:cx1,y0:yc-H/2,y1:yc+H/2,ang:Math.atan(sl)*180/Math.PI,wide:false};
  const sc=[];const t0=now(),R=await recognizeBoxes(g,[box],runner,keys,{rect:false});ms+=now()-t0;calls+=R.calls;const d=R.res[0];if(d&&d.m)sc.push(CTC.qtyScores(d.m));
  for(const p of r.l.parts)if(p.m&&p.x1>cx0&&p.x0<cx1){const f=framesIn(p,cx0,cx1);if(f&&f.T>=3)sc.push(CTC.qtyScores(f))}
  const pick=CTC.qtyPick(sc);if(pick){r.l.qcol={...pick,x0:cx0,x1:cx1,read:d?d.text:'',box};out.rows++}
  /* сумма: те же кадры, только цифры и точка — дочитывание «384.4» → «384.48» */
  if(r.s&&r.s.m){const f=framesIn(r.s,Math.max(cx1-.1*H,r.s.x0),r.s.x1+H);if(f){const mm=digitsOnly(f);if(/^\d{1,5}\.\d\d$/.test(mm))r.l.scol=mm}}}
 out.ms=ms;out.calls=calls;out.qx=tb.qx;return out}
/* 017: перенос названия на следующую строку чека. На предчеке название режется по ширине колонки посреди слова
   («Куриный шницель с картофеле» / «м айдахо», «…с опаленным лос» / «осем»), а прежний разбор отбрасывал такие обрывки как шум.
   Строка таблицы без чисел сразу под строкой с количеством и суммой присоединяется к её названию:
   без пробела — если название дошло до правой границы колонки названий, а перенос начат без отступа; иначе через пробел.
   Строка, в которой колонка количества уверенно прочитала число, переносом не считается (это отдельная позиция с потерянной суммой). */
const LATC={a:'а',b:'в',c:'с',d:'д',e:'е',h:'н',k:'к',m:'м',n:'н',o:'о',p:'р',r:'г',t:'т',u:'и',x:'х',y:'у',w:'ш'};
const FNEND=/(?:^|\s)(?:с|со|из|на|по|и|в|без|для|от|к)$/i;
const fixLat=t=>t.split(/(\s+)/).map(w=>/[a-z]/i.test(w)&&/[a-z]{1,}/i.test(w)?w.replace(/[a-z]/gi,c=>LATC[c.toLowerCase()]||c):w).join('');
function joinWraps(lines,tb){if(!tb)return lines;const isRow=l=>l.parts.some(p=>isSumTok(p.text)),letterParts=l=>{const N=l.parts.filter(p=>isSumTok(p.text)||isQtyTok(p.text)),x=N.length?Math.min(...N.map(p=>p.rx0??p.x0)):Infinity;return l.parts.filter(p=>/[а-яёa-z]/i.test(p.text)&&!isSumTok(p.text)&&(p.rx1??p.x1)<=x)};
 const nameEnd=l=>{const P=letterParts(l);if(!P.length)return null;const p=P.reduce((a,b)=>(b.rx1??b.x1)>(a.rx1??a.x1)?b:a),x=p.rx1??p.x1;return{x,cw:(x-(p.rx0??p.x0))/Math.max(1,p.text.trim().length),x0:Math.min(...P.map(q=>q.rx0??q.x0))}};
 const T=lines.slice(tb.hl+1,tb.end).filter(isRow).map(nameEnd).filter(Boolean),maxR=T.length?Math.max(...T.map(e=>e.x)):null,out=[];
 lines.forEach((l,i)=>{const prev=out[out.length-1],inT=i>tb.hl&&i<tb.end;const t=l.text.trim();
  if(inT&&prev&&prev._row&&!isRow(l)&&/[а-яёa-z]/i.test(t)&&t.length<=40&&!TOT.test(t)&&!HDR(t)&&!(l.qcol&&l.qcol.post>=.9)&&!/\d[.,:]\d/.test(t)){
   const ne=nameEnd(prev),m=prev.text.match(/^(.*?[^\s\d.,:;{(\[‚'`|])\s+([\d\s.,:;{(\[‚'`|]+)$/),nm=m?m[1]:prev.text,tail=m?m[2]:'';
   const cx0=Math.min(...l.parts.map(p=>p.rx0??p.x0)),hard=!!(ne&&maxR!=null&&ne.x>=maxR-.8*ne.cw),indent=!!(ne&&cx0-ne.x0>.5*ne.cw);
   if(hard||FNEND.test(nm)||/^[(+]/.test(t)||/^[а-яёa-z]/.test(t)){let ct=fixLat(t);if(!/^\(/.test(ct))ct=ct.toLowerCase();else ct=ct.replace(/[ТтTШшWw]{1,2}\s*\)?$/,'шт)');
    const j=hard&&!indent&&!/^[(+]/.test(ct)?'':' ',nl={...prev,text:nm+j+ct+(tail?'   '+tail:''),y1:Math.max(prev.y1,l.y1),contParts:[...(prev.contParts||[]),...l.parts],cont:[...(prev.cont||[]),{text:ct,join:j}]};out[out.length-1]=nl;return}}
  out.push({...l,_row:inT&&isRow(l)})});
 out.forEach(l=>{delete l._row});return out}
/* жадное прочтение только по цифрам и точке */
function digitsOnly(m){const R=CTC.R,mask=[0,...'0123456789.'].map(c=>c===0?0:CTC.colOf(c));let s='',last=0;for(let t=0;t<m.T;t++){let bi=0,bv=-Infinity;for(const k of mask){const v=m.lp[t*R+k];if(v>bv){bv=v;bi=k}}if(bi&&bi!==last)s+=CTC.ALPHA[bi];last=bi}return s}
/* ---------- полный проход ---------- */
async function recognize(src,o){o=o||{};const T0=now(),runner=o.runner,keys=o.keys;if(!runner||!keys)throw new Error('Neural OCR: нет модели');const P_=o.onProgress||(()=>{});
 let g=src.d.length===src.w*src.h*4?IMG.gray(src):src;if(o.quad){const w=IMG.warpQuad(g,o.quad,1600);if(w)g=w}
 const long=o.detLong||1280,ms={det:0,rec:0,post:0,col:0};let rot=0,turn=0;
 const det=async(gg,lg)=>{const P=prepDet(gg,lg||long),t0=now(),prob=await runner.det(P.x,P.dims);ms.det+=now()-t0;return{P,prob,B:detBoxes(prob,P,o)}};
 P_({phase:'neural-det',label:'Нейросеть: поиск строк'});let D=await det(g);
 /* 017: фото повёрнуто на 90° (строки стоят вертикально) — пробуем оба разворота, выбираем тот, где строки читаются увереннее */
 if(o.turn!==false){const vert=D.B.filter(b=>Math.abs(b.ang)>55&&b.score>.7).length,hor=D.B.filter(b=>Math.abs(b.ang)<35&&b.score>.7).length;
  if(vert>=8&&vert>2*hor){let best=null;for(const dir of[1,-1]){const gg=rot90(g,dir),DD=await det(gg,960),top=[...DD.B].sort((a,b)=>(b.x1-b.x0)-(a.x1-a.x0)).slice(0,6),R=await recognizeBoxes(gg,top,runner,keys,{mat:false});ms.rec+=R.ms;
    const c=R.res.filter(Boolean).reduce((a,x)=>a+x.conf,0)/Math.max(1,top.length);if(!best||c>best.c)best={c,dir,gg,DD}}
   g=best.gg;turn=best.dir*90;D=await det(g)}}
 /* наклон: по рамкам строк (017), иначе по профилю (013); заметный наклон — выпрямляем и ищем строки заново */
 const sk=o.deskew===false?0:(boxSkew(D.B)??skewAngle(D.prob,D.P.w,D.P.h));
 if(Math.abs(sk)>=(o.skewMin||2.5)){rot=sk;   /* 017: при наклоне до 2.5° строки собираются по локальному наклону и рамки выпрямляются по одной — второй поиск строк не нужен (замер: та же точность, −1 с) */
  g=IMG.rotate(g,-sk);D=await det(g)}
 let B=D.B;
 if(o.cancelled&&o.cancelled())return{cancelled:true};
 P_({phase:'neural-rec',label:`Нейросеть: чтение строк (${B.length})`,pct:0});
 const R=await recognizeBoxes(g,B,runner,keys,{rect:o.rect,onProgress:p=>P_({phase:'neural-rec',label:`Нейросеть: чтение строк (${B.length})`,pct:p})});ms.rec+=R.ms;
 /* дочитывание: фрагмент вида «.0», «.0 238.07» — у «1.0» потеряна узкая единица; расширяем рамку влево на высоту строки и читаем заново */
 const again=B.map((b,i)=>({b,i})).filter(z=>{if(!R.res[z.i]||!/^[.,]\d/.test(R.res[z.i].text.trim()))return false;const b=z.b,h=b.y1-b.y0,yc=(b.y0+b.y1)/2;
  return!B.some((c,j)=>j!==z.i&&R.res[j]&&Math.abs((c.y0+c.y1)/2-yc)<.4*h&&c.rx1>=b.rx0-.6*h&&c.rx1<=b.rx0+.3*h)});   /* слева вплотную уже есть кусок этой же строки («11.» + «.77») — не дочитываем */
 if(again.length){const B2=again.map(z=>{const h=z.b.y1-z.b.y0;return{...z.b,x0:z.b.x0-.9*h}}),R2=await recognizeBoxes(g,B2,runner,keys,{rect:o.rect});ms.rec+=R2.ms;
  again.forEach((z,k)=>{const t=R2.res[k]&&R2.res[k].text.trim();if(t&&/^\d{1,2}[.,]\d/.test(t)&&t.length<=R.res[z.i].text.trim().length+2){R.res[z.i]={...R2.res[k],text:t};B[z.i]={...B[z.i],x0:B2[k].x0,rx0:B2[k].x0}}})}
 const t1=now(),items=B.map((b,i)=>R.res[i]?{...b,text:R.res[i].text,conf:R.res[i].conf,min:R.res[i].min,m:R.res[i].m,cf:R.res[i].cf,fx0:R.res[i].fx0,fk:R.res[i].fk}:null).filter(Boolean),Lay=layout(items,o);ms.post=now()-t1;
 /* 017: колонка количества */
 let table={found:false};if(o.qtyColumn!==false){P_({phase:'neural-rec',label:'Нейросеть: колонка количества',pct:1});const t2=now();table=await qtyColumn(g,Lay.lines,runner,keys,Lay.hm,o);ms.col=now()-t2;if(table.found&&o.joinWraps!==false){const tb=tableOf(Lay.lines);const J=joinWraps(Lay.lines,tb);if(J.length!==Lay.lines.length){Lay.lines=J;Lay.text=J.map(l=>l.text).join('\n');table.joined=true}}}
 const words=Lay.lines.flatMap((l,li)=>l.parts.map(p=>({text:p.text,conf:Math.round(p.conf*100),x0:p.x0,y0:p.y0,x1:p.x1,y1:p.y1,line:li})));
 let G=g;/* для повторного чтения трудных строк: изображение держится, пока нужен результат (release() освобождает) */
 const reread=async(boxes,variant)=>{if(!G)return[];const v=variant==='pad'?{pad:1.33}:variant==='contrast'?{contrast:true}:variant==='shift'?{shift:.12}:variant==='shiftup'?{shift:-.12}:variant==='flat'?{rect:false}:{};
  const R3=await recognizeBoxes(G,boxes,runner,keys,v);return R3.res};
 return{text:Lay.text,lines:Lay.lines,words,boxes:items.length,region:Lay.region,hm:Lay.hm,rot,turn,table,size:[g.w,g.h],ms:{...ms,total:now()-T0},calls:R.calls+(table.calls||0),engine:'PP-OCRv5 mobile det + eslav_PP-OCRv5_mobile_rec',
  reread,release:()=>{G=null}}}
return{joinWraps,fixLat,recognize,skewAngle,boxSkew,prepDet,components,detBoxes,decode,layout,recInput,recognizeBoxes,qtyColumn,tableOf,framesIn,digitsOnly,rot90,xOf}});
