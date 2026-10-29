import path from 'node:path';
import { Library } from '../server/library.mjs';
import { ReleaseYears } from '../server/release-years.mjs';
const library = new Library({dataDir:process.env.DATA_DIR || path.resolve('data'),root:process.env.ROM_ROOT || 'C:\\RetroBat\\roms'});
const progress = () => JSON.stringify(library.list().map(({id,status,seconds})=>({id,status,seconds})));
const before=progress();
try {
  console.log(await new ReleaseYears(library).enrich());
  console.log('Game decisions and preview time unchanged:',before===progress());
  const all=library.list();
  console.log('With release years:',all.filter(game=>game.metadata.released).length,'of',all.length);
} finally {library.close();}
