/* GONER PACK 013: выполнение Neural OCR в браузере через onnxruntime-web (MIT, Microsoft), бэкенд WebAssembly.
   Модели лежат на самом сайте (папка models/, ~8.8 МБ), библиотека onnxruntime-web (~11 МБ wasm) при первом запуске берётся с jsdelivr;
   service worker кэширует всё для работы без интернета. Фото никуда не отправляется.
   ВНИМАНИЕ: этот файл НЕ запускался на настоящем Android/Яндекс Браузере и в браузере песочницы (нет доступа к CDN). Логика модели
   проверена тем же ONNX-файлом в ONNX Runtime (Python), предобработка — тем же neural.js. */
window.NEURAL_WEB=(()=>{const V='1.20.1',BASE=`https://cdn.jsdelivr.net/npm/onnxruntime-web@${V}/dist/`,M={det:'models/ppocrv5_mobile_det.onnx',rec:'models/eslav_ppocrv5_mobile_rec.onnx',keys:'models/ppocrv5_eslav_dict.txt'};
 let st=null,loading=null,info={},err=null;
 const lib=()=>window.ort?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src=BASE+'ort.wasm.min.js';s.onload=ok;s.onerror=()=>no(new Error('не удалось загрузить onnxruntime-web (нужен интернет при первом запуске)'));document.head.appendChild(s)});
 async function bytes(u,onP){const r=await fetch(u);if(!r.ok)throw new Error('файл модели не найден: '+u);const n=+r.headers.get('content-length')||0;if(!r.body||!n||!onP)return new Uint8Array(await r.arrayBuffer());
  const rd=r.body.getReader(),parts=[];let got=0;for(;;){const{done,value}=await rd.read();if(done)break;parts.push(value);got+=value.length;onP(got/n)}const o=new Uint8Array(got);let p=0;for(const x of parts){o.set(x,p);p+=x.length}return o}
 async function get(onP){if(st)return st;if(loading)return loading;loading=(async()=>{const t0=performance.now(),P=onP||(()=>{});P({label:'Нейросеть: загрузка библиотеки',pct:0});await lib();
  ort.env.wasm.wasmPaths=BASE;ort.env.wasm.numThreads=self.crossOriginIsolated?Math.min(4,navigator.hardwareConcurrency||2):1;
  const opt={executionProviders:['wasm'],graphOptimizationLevel:'all'};
  const db=await bytes(M.det,p=>P({label:'Нейросеть: загрузка модели поиска строк',pct:p*.4})),rb=await bytes(M.rec,p=>P({label:'Нейросеть: загрузка модели чтения',pct:.4+p*.4})),kt=await(await fetch(M.keys)).text();
  P({label:'Нейросеть: подготовка',pct:.9});const det=await ort.InferenceSession.create(db,opt),rec=await ort.InferenceSession.create(rb,opt);const keys=kt.split('\n');if(keys[keys.length-1]==='')keys.pop();
  info={loadMs:Math.round(performance.now()-t0),detBytes:db.length,recBytes:rb.length,threads:ort.env.wasm.numThreads,ort:V,mem:(performance.memory&&Math.round(performance.memory.usedJSHeapSize/1048576))||null};
  st={keys,runner:{det:async(x,d)=>{const r=await det.run({[det.inputNames[0]]:new ort.Tensor('float32',x,d)});return r[det.outputNames[0]].data},
   rec:async(x,d)=>{const r=await rec.run({[rec.inputNames[0]]:new ort.Tensor('float32',x,d)}),o=r[rec.outputNames[0]];await new Promise(z=>setTimeout(z,0));return{data:o.data,dims:o.dims}}}};err=null;return st})();
  try{return await loading}catch(e){err=e;throw e}finally{loading=null}}
 async function recognize(src,o){o=o||{};const s=await get(o.onProgress&&(e=>o.onProgress({phase:'neural-load',...e})));const r=await NEURAL.recognize(src,{...o,runner:s.runner,keys:s.keys});r.load=info;return r}
 return{recognize,preload:o=>get(o).then(()=>info),info:()=>info,ready:()=>!!st,error:()=>err,files:M,ortVersion:V}})();
