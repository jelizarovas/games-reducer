import path from 'node:path';
import { Library } from '../server/library.mjs';
import { Launchbox } from '../server/launchbox.mjs';
import { releaseYear } from '../src/library-view.js';
const library=new Library({dataDir:process.env.DATA_DIR||path.resolve('data'),root:process.env.ROM_ROOT||'C:\\RetroBat\\roms'});
const progress=()=>JSON.stringify(library.list().map(({id,status,seconds})=>({id,status,seconds})));
const before=progress();
const scraper=new Launchbox(library);
try {
  console.log('Metadata:',await scraper.enrich());
  const index=await scraper.index();
  console.log('Indexed title aliases:',index.size);
  if(process.argv.includes('--covers')) {
    const games=library.list().filter(g=>!g.missing&&!g.metadata.cover&&g.metadata.launchboxId);
    let done=0,added=0;
    for(let i=0;i<games.length;i+=3){const results=await Promise.all(games.slice(i,i+3).map(g=>scraper.cover(g.id)));added+=results.filter(Boolean).length;done+=results.length;if(done%150===0)console.log('Cover progress:',done,'/',games.length,'added',added);if(scraper.retryAfter>Date.now()){console.log('Provider cooldown; remaining images will retry as you browse.');break;}}
    console.log('Covers added:',added,'Last provider error:',scraper.lastError||'none');
  }
  const all=library.list();console.log('Totals:',{games:all.length,years:all.filter(g=>releaseYear(g.metadata)).length,covers:all.filter(g=>g.metadata.cover).length});
  console.log('Decisions and play time unchanged:',before===progress());
} finally {library.close();}
