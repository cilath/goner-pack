/* GONER PACK 009: адаптер Tesseract.js (браузер). Распознавание идёт на телефоне, фото никуда не отправляется.
   Из интернета при первом запуске загружаются сама библиотека и данные языковой модели (jsdelivr, projectnaptha).
   ВАЖНО: этот файл не проверялся на реальном Android и не запускался с настоящим Tesseract.js в песочнице (нет доступа к CDN);
   в тестах конвейера использовался нативный Tesseract. Всё, что зависит от формата ответа Tesseract.js (data.words/lines), помечено ниже. */
window.OCR=(()=>{const SRC='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',LANGS='rus';/* rus+eng в замерах дал больше ошибок, чем rus */
 let worker=null,pending=null,loading=null;
 const lib=()=>window.Tesseract?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src=SRC;s.onload=ok;s.onerror=()=>no(new Error('не удалось загрузить Tesseract.js (нужен интернет при первом запуске)'));document.head.appendChild(s)});
 async function get(){if(worker)return worker;if(loading)return loading;loading=(async()=>{await lib();const w=await Tesseract.createWorker(LANGS,1,{logger:m=>{if(pending)pending(m)}});await w.setParameters({preserve_interword_spaces:'1',user_defined_dpi:'300'});worker=w;return w})();try{return await loading}finally{loading=null}}
 function toCanvas(g){const c=document.createElement('canvas');c.width=g.w;c.height=g.h;const x=c.getContext('2d'),id=x.createImageData(g.w,g.h),o=id.data;for(let i=0,j=0;i<g.d.length;i++,j+=4){o[j]=o[j+1]=o[j+2]=g.d[i];o[j+3]=255}x.putImageData(id,0,0);return c}
 /* слова с рамками и номером строки. ФОРМАТ tesseract.js v5 (data.lines[].words[].bbox) не проверен на устройстве: есть запасной разбор blocks и геометрическая группировка */
 function words(data){let L=data.lines;if(!L&&data.blocks)L=data.blocks.flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));const out=[];
  if(L&&L.length)L.forEach((l,li)=>(l.words||[]).forEach(w=>{if(w.bbox&&String(w.text).trim())out.push({text:String(w.text).trim(),conf:w.confidence,x0:w.bbox.x0,y0:w.bbox.y0,x1:w.bbox.x1,y1:w.bbox.y1,line:li})}));
  else if(data.words)data.words.forEach((w,i)=>{if(w.bbox&&String(w.text).trim())out.push({text:String(w.text).trim(),conf:w.confidence,x0:w.bbox.x0,y0:w.bbox.y0,x1:w.bbox.x1,y1:w.bbox.y1,line:null})});
  return out}
 async function recognize(img,{psm=6},onPct){const w=await get();pending=m=>{if(onPct&&m.status==='recognizing text')onPct(m.progress)};
  try{await w.setParameters({tessedit_pageseg_mode:String(psm)});const{data}=await w.recognize(toCanvas(img));return{text:data.text||'',words:words(data)}}finally{pending=null}}
 async function cancel(){const w=worker;worker=null;pending=null;if(w)try{await w.terminate()}catch(e){}}
 return{recognize,cancel,preload:()=>get().then(()=>true)}})();
