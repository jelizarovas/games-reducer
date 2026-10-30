import fs from 'node:fs';
import {engineDirectory} from './engine-version.mjs';
for(const route of ['games']){fs.mkdirSync(`dist/${route}`,{recursive:true});fs.copyFileSync('dist/index.html',`dist/${route}/index.html`);}
fs.cpSync('public/engine',`dist/${engineDirectory}`,{recursive:true});
