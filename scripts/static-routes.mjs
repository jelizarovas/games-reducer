import fs from 'node:fs';
for(const route of ['games']){fs.mkdirSync(`dist/${route}`,{recursive:true});fs.copyFileSync('dist/index.html',`dist/${route}/index.html`);}
