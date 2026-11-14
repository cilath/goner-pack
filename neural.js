/* GONER PACK 013: Neural OCR — PaddleOCR PP-OCRv5 (детектор строк PP-OCRv5_mobile_det + распознаватель eslav_PP-OCRv5_mobile_rec,
   русский/украинский/белорусский + латиница и цифры). Лицензия моделей Apache-2.0.
   Модуль не зависит от среды выполнения нейросети: ему передаётся runner = {det(data,dims)→Float32Array, rec(data,dims)→{data,dims}}.
   В браузере runner — onnxruntime-web (neural-web.js), в тестах — ONNX Runtime через Python (tests/ort-runner.js). Предобработка и
   разбор результата здесь одинаковы для обоих случаев. Нейросеть только читает текст: блюда собирает прежний разбор 012 + справочник. */
(function(r,f){const nd=typeof require==='function'&&typeof module==='object',m=f(nd?require('./imgproc.js'):r.IMG);if(nd&&module.exports)module.exports=m;else r.NEURAL=m})(typeof self!=='undefined'?self:this,function(IMG){
const DET_MEAN=[.485,.456,.406],DET_STD=[.229,.224,.225];
const now=()=>(typeof performance!=='undefined'?performance.now():Date.now());
/* ---------- детектор ---------- */
function prepDet(g,long){const k=Math.min(1,long/Math.max(g.w,g.h)),w=Math.max(32,Math.round(g.w*k/32)*32),h=Math.max(32,Math.round(g.h*k/32)*32),s=IMG.resize(g,w,h),n=w*h,x=new Float32Array(3*n);
 for(let i=0;i<n;i++){const v=s.d[i]/255;x[i]=(v-DET_MEAN[0])/DET_STD[0];x[n+i]=(v-DET_MEAN[1])/DET_STD[1];x[2*n+i]=(v-DET_MEAN[2])/DET_STD[2]}
 return{x,dims:[1,3,h,w],w,h,kx:w/g.w,ky:h/g.h}}
/* компоненты связности карты вероятностей: рамка, площадь, средняя вероятность, наклон (по вторым моментам) */
function components(prob,w,h,thr){const lab=new Int32Array(w*h),out=[],st=new Int32Array(w*h);let id=0;
 for(let p=0;p<w*h;p++){if(lab[p]||prob[p]<=thr)continue;id++;let sp=0;st[sp++]=p;lab[p]=id;let x0=w,y0=h,x1=0,y1=0,a=0,sc=0,mx=0,my=0,mxx=0,myy=0,mxy=0;
  while(sp){const q=st[--sp],x=q%w,y=(q/w)|0;a++;sc+=prob[q];mx+=x;my+=y;mxx+=x*x;myy+=y*y;mxy+=x*y;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
   if(x>0&&!lab[q-1]&&prob[q-1]>thr){lab[q-1]=id;st[sp++]=q-1}if(x<w-1&&!lab[q+1]&&prob[q+1]>thr){lab[q+1]=id;st[sp++]=q+1}
   if(y>0&&!lab[q-w]&&prob[q-w]>thr){lab[q-w]=id;st[sp++]=q-w}if(y<h-1&&!lab[q+w]&&prob[q+w]>thr){lab[q+w]=id;st[sp++]=q+w}}
  mx/=a;my/=a;const cxx=mxx/a-mx*mx,cyy=myy/a-my*my,cxy=mxy/a-mx*my;out.push({x0,y0,x1:x1+1,y1:y1+1,a,score:sc/a,ang:.5*Math.atan2(2*cxy,cxx-cyy)*180/Math.PI})}
 return out}
function detBoxes(prob,P,o){const C=components(prob,P.w,P.h,o.thresh||.3),B=[];
 for(const c of C){const bw=c.x1-c.x0,bh=c.y1-c.y0;if(bh<3||c.a<4||c.score<(o.boxThresh||.6))continue;   /* узкая «1» в «1.0» бывает шириной 1–2 px: по ширине не отсекаем */
  const d=c.a*(o.unclip||1.6)/(2*(bw+bh)),dx=d+.25*bh;   // расширение рамки (как unclip в PaddleOCR) + запас по ширине: тонкая «1» в «1.0»
  B.push({rx0:c.x0/P.kx,rx1:c.x1/P.kx,x0:(c.x0-dx)/P.kx,y0:(c.y0-d)/P.ky,x1:(c.x1+dx)/P.kx,y1:(c.y1+d)/P.ky,score:c.score,ang:c.ang,wide:bw>4*bh})}
 return B}
/* наклон по проекционному профилю карты вероятностей: угол, при котором строки дают самые резкие горизонтальные полосы.
   Не требует второго прохода нейросети; второй проход нужен, только если наклон заметный. */
function skewAngle(prob,w,h,o){o=o||{};const pts=[];for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2)if(prob[y*w+x]>.3)pts.push(x,y);if(pts.length<200)return 0;
 const score=a=>{const r=a*Math.PI/180,s=Math.sin(r),c=Math.cos(r),off=w*Math.abs(s)+2,H=new Float64Array(Math.ceil(h+2*off)+2);for(let i=0;i<pts.length;i+=2){const yy=(pts[i+1]*c-pts[i]*s+off)/2;H[yy|0]++}let v=0;for(let i=0;i<H.length;i++)v+=H[i]*H[i];return v};
 let best=0,bv=-1;for(let a=-(o.max||10);a<=(o.max||10)+1e-9;a+=.5){const v=score(a);if(v>bv){bv=v;best=a}}
 for(let a=best-.4;a<=best+.4+1e-9;a+=.1){const v=score(a);if(v>bv){bv=v;best=a}}return Math.round(best*10)/10}
/* ---------- распознаватель ---------- */
function decode(out,dims,keys){const[n,T,C]=dims,res=[];for(let b=0;b<n;b++){let s='',last=0,cs=[];const base=b*T*C;
  for(let t=0;t<T;t++){let bi=0,bv=-1;const o=base+t*C;for(let c=0;c<C;c++){const v=out[o+c];if(v>bv){bv=v;bi=c}}if(bi!==0&&bi!==last){s+=keys[bi-1]||'';cs.push(bv)}last=bi}
  res.push({text:s,conf:cs.length?cs.reduce((a,v)=>a+v,0)/cs.length:0,min:cs.length?Math.min(...cs):0})}return res}
function recInput(g,b,H){const x0=Math.max(0,Math.floor(b.x0)),y0=Math.max(0,Math.floor(b.y0)),x1=Math.min(g.w,Math.ceil(b.x1)),y1=Math.min(g.h,Math.ceil(b.y1));if(x1-x0<2||y1-y0<2)return null;
 const c=IMG.crop(g,x0,y0,x1,y1),W=Math.max(16,Math.min(2400,Math.round(c.w*H/c.h/8)*8));return IMG.resize(c,W,H)}
async function recognizeBoxes(g,B,runner,keys,o){const H=48,items=B.map((b,i)=>({b,i,im:recInput(g,b,H)})).filter(z=>z.im).sort((a,b)=>a.im.w-b.im.w),out=new Array(B.length);let ms=0,calls=0;
 const maxB=1;/* модель сконвертирована с батчем 1: единица зашита во внутренних Reshape */for(let s=0;s<items.length;){let e=s+1;while(e<items.length&&e-s<maxB&&items[e].im.w<=items[s].im.w*1.35+16)e++;const grp=items.slice(s,e),W=grp[grp.length-1].im.w,n=grp.length,x=new Float32Array(n*H*W*3);
  grp.forEach((z,k)=>{const im=z.im,base=k*H*W*3;for(let y=0;y<H;y++)for(let xx=0;xx<im.w;xx++){const v=(im.d[y*im.w+xx]-127.5)/127.5,q=base+(y*W+xx)*3;x[q]=x[q+1]=x[q+2]=v}});
  const t0=now(),r=await runner.rec(x,[n,H,W,3]);ms+=now()-t0;calls++;decode(r.data,r.dims,keys).forEach((d,k)=>{out[grp[k].i]=d});s=e;if(o.onProgress)o.onProgress(s/items.length)}
 return{res:out,ms,calls}}
/* ---------- раскладка: область чека, строки, текст ---------- */
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.min(s.length-1,Math.max(0,Math.round(p*(s.length-1))))]:0};
function layout(items){const L=items.filter(z=>z.text&&z.text.trim());if(!L.length)return{lines:[],text:'',region:null};
 // область чека: по уверенным словам из ≥3 букв/цифр; посторонний текст рядом (упаковка, этикетки) отбрасывается
 const core=L.filter(z=>z.conf>=.8&&z.text.replace(/[^а-яёa-z0-9]/gi,'').length>=3);const C=core.length>=5?core:L;
 const lx=pct(C.map(z=>z.x0),.1),rx=pct(C.map(z=>z.x1),.9),mg=.06*(rx-lx),region={x0:lx-mg,x1:rx+mg};
 const In=L.filter(z=>{const c=(z.x0+z.x1)/2;return c>=region.x0&&c<=region.x1});
 const hs=In.map(z=>z.y1-z.y0).sort((a,b)=>a-b),hm=hs[hs.length>>1]||20;
 /* перекрытие по исходным (нерасширенным) рамкам: сильное — значит две строки слились, слабое — соседние куски одной строки */
 const ovl=(a,b)=>{const ax0=a.rx0??a.x0,ax1=a.rx1??a.x1,bx0=b.rx0??b.x0,bx1=b.rx1??b.x1,o=Math.min(ax1,bx1)-Math.max(ax0,bx0);return o<=0?0:o/Math.max(1,Math.min(ax1-ax0,bx1-bx0))};
 const rows=[];for(const z of[...In].sort((a,b)=>(a.y0+a.y1)-(b.y0+b.y1))){const yc=(z.y0+z.y1)/2,R=rows[rows.length-1];
  if(R&&Math.abs(yc-R.yc)<=.42*hm&&!R.w.some(q=>ovl(q,z)>.6)){R.w.push(z);R.yc=(R.yc*(R.w.length-1)+yc)/R.w.length}else rows.push({w:[z],yc})}
 // строки, попавшие в один ряд с пересечением по x (две строки слились в рамку), остаются отдельными рядами
 const lines=rows.map(R=>{R.w.sort((a,b)=>a.x0-b.x0);let t='';R.w.forEach((z,i)=>{let tx=z.text.trim();if(i){const q=R.w[i-1],gap=(z.rx0??z.x0)-(q.rx1??q.x1);if(gap<.25*hm){if(/[.,]$/.test(t)&&/^[.,]/.test(tx))tx=tx.slice(1);/* «11.» + «.77» → «11.77», «1» + «.0» → «1.0» */}else t+=gap>1.2*hm?'   ':' '}t+=tx});
  return{text:t,conf:R.w.reduce((a,z)=>a+z.conf,0)/R.w.length,x0:Math.min(...R.w.map(z=>z.x0)),y0:Math.min(...R.w.map(z=>z.y0)),x1:Math.max(...R.w.map(z=>z.x1)),y1:Math.max(...R.w.map(z=>z.y1)),parts:R.w.map(z=>({text:z.text,conf:z.conf,x0:z.x0,y0:z.y0,x1:z.x1,y1:z.y1}))}});
 lines.sort((a,b)=>(a.y0+a.y1)-(b.y0+b.y1));return{lines,text:lines.map(l=>l.text).join('\n'),region,hm}}
/* ---------- полный проход ---------- */
async function recognize(src,o){o=o||{};const T0=now(),runner=o.runner,keys=o.keys;if(!runner||!keys)throw new Error('Neural OCR: нет модели');const P_=o.onProgress||(()=>{});
 let g=src.d.length===src.w*src.h*4?IMG.gray(src):src;if(o.quad){const w=IMG.warpQuad(g,o.quad,1600);if(w)g=w}
 const long=o.detLong||1280,ms={det:0,rec:0,post:0};let rot=0;
 P_({phase:'neural-det',label:'Нейросеть: поиск строк'});let P=prepDet(g,long),t0=now(),prob=await runner.det(P.x,P.dims);ms.det+=now()-t0;let B=detBoxes(prob,P,o);
 /* наклон: если строки заметно наклонены, выпрямляем и ищем строки заново */
 const sk=o.deskew===false?0:skewAngle(prob,P.w,P.h);
 if(Math.abs(sk)>=(o.skewMin||.8)){rot=sk;g=IMG.rotate(g,(o.deskewSign||-1)*sk);P=prepDet(g,long);t0=now();prob=await runner.det(P.x,P.dims);ms.det+=now()-t0;B=detBoxes(prob,P,o)}
 if(o.cancelled&&o.cancelled())return{cancelled:true};
 P_({phase:'neural-rec',label:`Нейросеть: чтение строк (${B.length})`,pct:0});
 const R=await recognizeBoxes(g,B,runner,keys,{batch:o.batch,onProgress:p=>P_({phase:'neural-rec',label:`Нейросеть: чтение строк (${B.length})`,pct:p})});ms.rec=R.ms;
 /* дочитывание: фрагмент вида «.0», «.0 238.07» — у «1.0» потеряна узкая единица; расширяем рамку влево на высоту строки и читаем заново */
 const again=B.map((b,i)=>({b,i})).filter(z=>{if(!R.res[z.i]||!/^[.,]\d/.test(R.res[z.i].text.trim()))return false;const b=z.b,h=b.y1-b.y0,yc=(b.y0+b.y1)/2;
  return!B.some((c,j)=>j!==z.i&&R.res[j]&&Math.abs((c.y0+c.y1)/2-yc)<.4*h&&c.rx1>=b.rx0-.6*h&&c.rx1<=b.rx0+.3*h)});   /* слева вплотную уже есть кусок этой же строки («11.» + «.77») — не дочитываем */
 if(again.length){const B2=again.map(z=>{const h=z.b.y1-z.b.y0;return{...z.b,x0:z.b.x0-.9*h}}),R2=await recognizeBoxes(g,B2,runner,keys,{});ms.rec+=R2.ms;
  again.forEach((z,k)=>{const t=R2.res[k]&&R2.res[k].text.trim();if(t&&/^\d{1,2}[.,]\d/.test(t)&&t.length<=R.res[z.i].text.trim().length+2){R.res[z.i]={...R2.res[k],text:t};B[z.i]={...B[z.i],x0:B2[k].x0,rx0:B2[k].x0}}})}
 const t1=now(),items=B.map((b,i)=>R.res[i]?{...b,text:R.res[i].text,conf:R.res[i].conf,min:R.res[i].min}:null).filter(Boolean),Lay=layout(items);ms.post=now()-t1;
 const words=Lay.lines.flatMap((l,li)=>l.parts.map(p=>({text:p.text,conf:Math.round(p.conf*100),x0:p.x0,y0:p.y0,x1:p.x1,y1:p.y1,line:li})));
 return{text:Lay.text,lines:Lay.lines,words,boxes:items.length,region:Lay.region,rot,size:[g.w,g.h],ms:{...ms,total:now()-T0},calls:R.calls,engine:'PP-OCRv5 mobile det + eslav_PP-OCRv5_mobile_rec'}}
return{recognize,skewAngle,prepDet,components,detBoxes,decode,layout,recInput}});
