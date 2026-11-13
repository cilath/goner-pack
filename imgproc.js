/* GONER PACK 009: обработка изображений без DOM (работает в браузере и в Node).
   Изображение серого цвета: {w,h,d:Uint8ClampedArray}. Цветное: {w,h,d} RGBA (из canvas.getImageData). */
(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.IMG=m})(typeof self!=='undefined'?self:this,function(){
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function gray(im){const n=im.w*im.h,o=new Uint8ClampedArray(n),d=im.d;for(let i=0,j=0;i<n;i++,j+=4)o[i]=(d[j]*77+d[j+1]*150+d[j+2]*29)>>8;return{w:im.w,h:im.h,d:o}}
/* билинейная выборка */
function samp(g,x,y){const w=g.w,h=g.h;if(x<0)x=0;else if(x>w-1)x=w-1;if(y<0)y=0;else if(y>h-1)y=h-1;const x0=x|0,y0=y|0,x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=x-x0,fy=y-y0,d=g.d,a=d[y0*w+x0],b=d[y0*w+x1],c=d[y1*w+x0],e=d[y1*w+x1];return a+(b-a)*fx+(c-a)*fy+(a-b-c+e)*fx*fy}
/* изменение размера: уменьшение — усреднение по площади, увеличение — билинейно (гладко, без кубических артефактов) */
function resize(g,nw,nh){nw=Math.max(1,Math.round(nw));nh=Math.max(1,Math.round(nh));const o=new Uint8ClampedArray(nw*nh),sx=g.w/nw,sy=g.h/nh;
 if(sx>1.01||sy>1.01){for(let y=0;y<nh;y++){const ya=y*sy,yb=Math.min(g.h,(y+1)*sy);for(let x=0;x<nw;x++){const xa=x*sx,xb=Math.min(g.w,(x+1)*sx);let s=0,c=0;for(let yy=Math.floor(ya);yy<Math.ceil(yb);yy++){const wy=Math.min(yy+1,yb)-Math.max(yy,ya);for(let xx=Math.floor(xa);xx<Math.ceil(xb);xx++){const wx=Math.min(xx+1,xb)-Math.max(xx,xa),wt=wx*wy;s+=g.d[yy*g.w+xx]*wt;c+=wt}}o[y*nw+x]=s/c}}}
 else for(let y=0;y<nh;y++)for(let x=0;x<nw;x++)o[y*nw+x]=samp(g,(x+.5)*sx-.5,(y+.5)*sy-.5);
 return{w:nw,h:nh,d:o}}
function percentiles(g,p){const h=new Uint32Array(256);for(let i=0;i<g.d.length;i++)h[g.d[i]]++;const n=g.d.length;let a=0,lo=0,hi=255;for(let v=0;v<256;v++){a+=h[v];if(a>n*p){lo=v;break}}a=0;for(let v=255;v>=0;v--){a+=h[v];if(a>n*p){hi=v;break}}return[lo,hi]}
function stretch(g,p=.02){const[lo,hi]=percentiles(g,p),s=255/Math.max(1,hi-lo),o=new Uint8ClampedArray(g.d.length);for(let i=0;i<o.length;i++)o[i]=(g.d[i]-lo)*s;return{w:g.w,h:g.h,d:o}}
/* интегральные изображения для локальных статистик */
function integral(g,sq){const w=g.w,h=g.h,I=new Float64Array((w+1)*(h+1));for(let y=1;y<=h;y++){let r=0;for(let x=1;x<=w;x++){const v=g.d[(y-1)*w+x-1];r+=sq?v*v:v;I[y*(w+1)+x]=I[(y-1)*(w+1)+x]+r}}return I}
function boxStat(I,w,h,x,y,R){const x0=Math.max(0,x-R),x1=Math.min(w,x+R+1),y0=Math.max(0,y-R),y1=Math.min(h,y+R+1),W=w+1;return[(I[y1*W+x1]-I[y0*W+x1]-I[y1*W+x0]+I[y0*W+x0]),(x1-x0)*(y1-y0)]}
/* выравнивание неравномерного освещения: делим на локальное среднее (тень на бумаге не должна съедать текст) */
function flatten(g,R){const I=integral(g),o=new Uint8ClampedArray(g.d.length);for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++){const[s,n]=boxStat(I,g.w,g.h,x,y,R),m=Math.max(20,s/n);o[y*g.w+x]=clamp(g.d[y*g.w+x]/m*200,0,255)}return{w:g.w,h:g.h,d:o}}
/* адаптивная бинаризация Саувола: порог = m·(1+k(σ/128−1)) */
function sauvola(g,R,k=.2){const I=integral(g),J=integral(g,true),o=new Uint8ClampedArray(g.d.length);for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++){const[s,n]=boxStat(I,g.w,g.h,x,y,R),[s2]=boxStat(J,g.w,g.h,x,y,R),m=s/n,sd=Math.sqrt(Math.max(0,s2/n-m*m));o[y*g.w+x]=g.d[y*g.w+x]>m*(1+k*(sd/128-1))?255:0}return{w:g.w,h:g.h,d:o}}
/* гомография 4 точек → 4 точек (решение 8×8 методом Гаусса) */
function homography(src,dst){const A=[],b=[];for(let i=0;i<4;i++){const[x,y]=src[i],[u,v]=dst[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v)}
 const n=8;for(let i=0;i<n;i++){let p=i;for(let r=i+1;r<n;r++)if(Math.abs(A[r][i])>Math.abs(A[p][i]))p=r;[A[i],A[p]]=[A[p],A[i]];[b[i],b[p]]=[b[p],b[i]];if(Math.abs(A[i][i])<1e-12)return null;for(let r=i+1;r<n;r++){const f=A[r][i]/A[i][i];for(let c=i;c<n;c++)A[r][c]-=f*A[i][c];b[r]-=f*b[i]}}
 const x=new Array(n);for(let i=n-1;i>=0;i--){let s=b[i];for(let c=i+1;c<n;c++)s-=A[i][c]*x[c];x[i]=s/A[i][i]}return x}
const applyH=(H,x,y)=>{const w=H[6]*x+H[7]*y+1;return[(H[0]*x+H[1]*y+H[2])/w,(H[3]*x+H[4]*y+H[5])/w]};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
/* выпрямление четырёхугольника (порядок: верх-лево, верх-право, низ-право, низ-лево) в прямоугольник */
function warpQuad(g,quad,maxW=1600){const[tl,tr,br,bl]=quad,w0=Math.max(dist(tl,tr),dist(bl,br)),h0=Math.max(dist(tl,bl),dist(tr,br));if(w0<20||h0<20)return null;
 const k=Math.min(1,maxW/w0),w=Math.round(w0*k),h=Math.round(h0*k),H=homography([[0,0],[w,0],[w,h],[0,h]],quad);if(!H)return null;
 const o=new Uint8ClampedArray(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const[sx,sy]=applyH(H,x+.5,y+.5);o[y*w+x]=samp(g,sx-.5,sy-.5)}return{w,h,d:o}}
function crop(g,x0,y0,x1,y1){x0=clamp(Math.round(x0),0,g.w-1);y0=clamp(Math.round(y0),0,g.h-1);x1=clamp(Math.round(x1),x0+1,g.w);y1=clamp(Math.round(y1),y0+1,g.h);const w=x1-x0,h=y1-y0,o=new Uint8ClampedArray(w*h);for(let y=0;y<h;y++)o.set(g.d.subarray((y0+y)*g.w+x0,(y0+y)*g.w+x0+w),y*w);return{w,h,d:o}}
/* поворот на угол (градусы, по часовой) вокруг центра с расширением холста; фон — белый */
function rotate(g,deg){if(Math.abs(deg)<.05)return g;const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),nw=Math.ceil(Math.abs(g.w*c)+Math.abs(g.h*s)),nh=Math.ceil(Math.abs(g.w*s)+Math.abs(g.h*c)),o=new Uint8ClampedArray(nw*nh).fill(255),cx=g.w/2,cy=g.h/2,ox=nw/2,oy=nh/2;
 for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const dx=x-ox,dy=y-oy,sx=c*dx+s*dy+cx,sy=-s*dx+c*dy+cy;if(sx>=0&&sy>=0&&sx<=g.w-1&&sy<=g.h-1)o[y*nw+x]=samp(g,sx,sy)}return{w:nw,h:nh,d:o}}
/* наклон строк: по группам слов одной строки (≥3 слов) — медиана углов в градусах; положительный = строка идёт вниз вправо */
function skewDeg(words){const by={};for(const w of words){if(w.line==null)continue;(by[w.line]=by[w.line]||[]).push(w)}const A=[];
 for(const k in by){const L=by[k];if(L.length<3)continue;const X=L.map(w=>(w.x0+w.x1)/2),Y=L.map(w=>(w.y0+w.y1)/2),n=L.length,mx=X.reduce((a,b)=>a+b)/n,my=Y.reduce((a,b)=>a+b)/n;let sxx=0,sxy=0;for(let i=0;i<n;i++){sxx+=(X[i]-mx)**2;sxy+=(X[i]-mx)*(Y[i]-my)}if(sxx>0&&Math.sqrt(sxx/n)>20)A.push(Math.atan(sxy/sxx)*180/Math.PI)}
 if(A.length<2)return{deg:0,n:A.length};A.sort((a,b)=>a-b);return{deg:clamp(A[A.length>>1],-15,15),n:A.length}}
/* автоопределение рамки по уверенным словам (процентили, устойчивы к одиночным ложным словам) */
function textBox(words,minConf=70,minLen=3){const W=words.filter(w=>w.conf>=minConf&&String(w.text).replace(/\s/g,'').length>=minLen);if(W.length<6)return null;const q=(a,p)=>{a=[...a].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.round(p*(a.length-1))))]};
 return{x0:q(W.map(w=>w.x0),.1),y0:q(W.map(w=>w.y0),.03),x1:q(W.map(w=>w.x1),.9),y1:q(W.map(w=>w.y1),.97),n:W.length}}
/* выпуклый четырёхугольник без самопересечений (все повороты в одну сторону) */
function isConvex(q){let s=0;for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4],c=q[(i+2)%4],z=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(Math.abs(z)<1)return false;const sg=z>0?1:-1;if(s&&sg!==s)return false;s=sg}return true}
return{isConvex,gray,resize,stretch,flatten,sauvola,homography,applyH,warpQuad,crop,rotate,skewDeg,textBox,percentiles}});
