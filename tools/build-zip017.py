#!/usr/bin/env python3
"""GONER PACK 017: ZIP для загрузки в корень репозитория GitHub Pages. Только файлы сайта (без tests/, tools/, node_modules/, models/).
   Папка models/ не меняется — её не трогать. Запуск: python3 -I tools/build-zip017.py <куда.zip>"""
import sys, zipfile, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
files = ['index.html','lab.html','style.css','manifest.webmanifest','icon-192.png','icon-512.png','service-worker.js','README.md',
 'app.js','parser.js','matcher.js','learning.js','review.js','screenshot.js','dict-seed.js','dict.js','core.js','db.js','imgproc.js',
 'ctc.js','pipeline.js','neural.js','neural-web.js','ocr.js','lab.js','lab-score.js','lab-truths.js']
out = sys.argv[1] if len(sys.argv) > 1 else 'GONER_PACK_017_GitHub_update.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(root / f, f)
print(out, len(files), 'файлов')
