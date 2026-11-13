/* GONER PACK 007: OCR на Tesseract.js (v5). Фото НЕ отправляется на сервер: распознавание идёт на телефоне.
   Из интернета загружаются только сама библиотека и данные модели (первый запуск). */
window.OCR=(()=>{const SRC='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
 const lib=()=>window.Tesseract?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src=SRC;s.onload=ok;s.onerror=()=>no(new Error('не удалось загрузить Tesseract.js (нужен интернет)'));document.head.appendChild(s)});
 function prep(url){return new Promise((r,no)=>{const i=new Image();i.onerror=()=>no(new Error('не удалось открыть фото'));i.onload=()=>{
  const k=Math.min(2400,Math.max(1600,i.width))/i.width,c=document.createElement('canvas');c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);
  const x=c.getContext('2d');x.drawImage(i,0,0,c.width,c.height);const d=x.getImageData(0,0,c.width,c.height),p=d.data,h=new Array(256).fill(0);
  for(let j=0;j<p.length;j+=4){const g=(p[j]*.3+p[j+1]*.59+p[j+2]*.11)|0;p[j]=g;h[g]++}
  const n=c.width*c.height;let a=0,lo=0,hi=255;for(let v=0;v<256;v++){a+=h[v];if(a>n*.02){lo=v;break}}a=0;for(let v=255;v>=0;v--){a+=h[v];if(a>n*.02){hi=v;break}}
  const s=255/Math.max(1,hi-lo);for(let j=0;j<p.length;j+=4){const g=Math.max(0,Math.min(255,(p[j]-lo)*s));p[j]=p[j+1]=p[j+2]=g}
  x.putImageData(d,0,0);r(c)};i.src=url})}
 async function run(url,onp){await lib();const img=await prep(url);let w;
  try{w=await Tesseract.createWorker('rus',1,{logger:m=>onp&&onp(m)});await w.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
   return (await w.recognize(img)).data.text}finally{if(w)try{await w.terminate()}catch(e){}}}
 return{run}})();
