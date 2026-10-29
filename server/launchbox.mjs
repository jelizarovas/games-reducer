import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { Unzip, UnzipInflate } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { coverTitle } from './covers.mjs';
import { releaseYear, gameCategory } from '../src/library-view.js';

const platforms = {'Sega Genesis':'megadrive','Super Nintendo Entertainment System':'snes','Nintendo Entertainment System':'nes'};
const source = 'https://gamesdb.launchbox-app.com/Metadata.zip';
const day = 86400000;
const key = title => coverTitle(title.replace(/&/g,' and '));
const variant = title => /\b(hack|beta|proto|prototype|sample|demo|aftermarket|homebrew)\b|\[(?:h|t|p|f|b)\d*[^\]]*\]/i.test(title);

export function buildLaunchboxIndex(entries) {
  const index = new Map();
  for(const entry of entries) for(const title of [entry.title,...entry.aliases]) {
    const id = `${entry.system}:${key(title)}`;
    if(!index.has(id))index.set(id,[]);
    if(!index.get(id).some(item=>item.id===entry.id))index.get(id).push(entry);
  }
  return index;
}
export function matchLaunchbox(game,index) {
  const filename = game.relative_path.split(/[\\/]/).pop();
  if(variant(filename))return null;
  const matches = index.get(`${game.system}:${key(filename)}`) || [];
  // Ambiguous names are left untouched; no fuzzy matching between sequels or ports.
  return matches.length===1 ? matches[0] : null;
}

export async function parseLaunchboxZip(file) {
  const entries = new Map(), parser = new XMLParser({parseTagValue:false});
  let buffer='', total=0, failure, found=false;
  const decoder = new StringDecoder('utf8');
  function consume(text) {
    buffer += text;
    while(true) {
      const match = /<(Game|GameAlternateName|GameImage)>/.exec(buffer);
      if(!match) {buffer=buffer.slice(-40);break;}
      const close=`</${match[1]}>`, end=buffer.indexOf(close,match.index);
      if(end<0){buffer=buffer.slice(match.index);break;}
      const block=buffer.slice(match.index,end+close.length); buffer=buffer.slice(end+close.length);
      const id=block.match(/<DatabaseID>(\d+)<\/DatabaseID>/)?.[1];
      if(match[1]==='Game') {
        const platform=block.match(/<Platform>([^<]+)<\/Platform>/)?.[1];
        if(!platforms[platform])continue;
        const g=parser.parse(block).Game;
        if(/hack|prototype|unreleased/i.test(g.ReleaseType || ''))continue;
        const year=releaseYear({released:g.ReleaseDate || g.ReleaseYear});
        entries.set(id,{id,title:g.Name,system:platforms[platform],year,genre:g.Genres||'',aliases:[],covers:[]});
      } else if(entries.has(id)) {
        const entry=entries.get(id);
        if(match[1]==='GameAlternateName')entry.aliases.push(parser.parse(block).GameAlternateName.AlternateName);
        else if(block.includes('<Type>Box - Front</Type>')) {
          const g=parser.parse(block).GameImage;
          if(/^[a-f\d-]+\.(png|jpg|jpeg)$/i.test(g.FileName))entry.covers.push({file:g.FileName,region:g.Region || ''});
        }
      }
    }
    if(buffer.length>2*1024*1024)throw new Error('Unexpected LaunchBox XML record size');
  }
  const unzip = new Unzip(entry => {
    if(entry.name!=='Metadata.xml')return;
    found=true;
    if(entry.originalSize>1024*1024*1024)throw new Error('LaunchBox XML is too large');
    entry.ondata=(error,bytes,final)=>{
      if(error){failure=error;return;}
      total+=bytes.length;if(total>1024*1024*1024)throw new Error('LaunchBox XML is too large');
      consume(decoder.write(bytes));if(final)consume(decoder.end());
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  for await(const bytes of fs.createReadStream(file)) {unzip.push(bytes);if(failure)throw failure;await yieldTurn();}
  unzip.push(new Uint8Array(),true);
  if(failure)throw failure;
  if(!found || entries.size<100)throw new Error('LaunchBox index is incomplete');
  return [...entries.values()];
}

async function boundedDownload(url,limit,timeout=20000) {
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw Object.assign(new Error(`LaunchBox returned HTTP ${response.status}`),{status:response.status});
  const parts=[];let size=0;
  for await(const part of response.body){size+=part.length;if(size>limit)throw Object.assign(new Error('LaunchBox response too large'),{localImageError:true});parts.push(part);}
  return Buffer.concat(parts);
}

export class Launchbox {
  constructor(library){this.library=library;this.loading=null;this.pending=null;this.retryAfter=0;this.covers=new Map();this.active=0;this.waiters=[];}
  async index() {
    if(this.loading)return this.loading;
    if(Date.now()<this.retryAfter)throw new Error('LaunchBox is temporarily unavailable');
    this.loading=(async()=>{
      const dir=path.join(this.library.dataDir,'launchbox');fs.mkdirSync(dir,{recursive:true});
      const cache=path.join(dir,'index-v2.json');
      if(fs.existsSync(cache) && Date.now()-fs.statSync(cache).mtimeMs<30*day)return buildLaunchboxIndex(JSON.parse(fs.readFileSync(cache,'utf8')));
      const zip=path.join(dir,'Metadata.zip');
      if(!fs.existsSync(zip) || Date.now()-fs.statSync(zip).mtimeMs>=30*day) {
        const bytes=await boundedDownload(source,180*1024*1024,120000);
        fs.writeFileSync(zip+'.part',bytes);fs.renameSync(zip+'.part',zip);
      }
      const entries=await parseLaunchboxZip(zip);
      fs.writeFileSync(cache+'.part',JSON.stringify(entries));fs.renameSync(cache+'.part',cache);
      return buildLaunchboxIndex(entries);
    })().catch(error=>{this.loading=null;this.retryAfter=Date.now()+60000;throw error;});
    return this.loading;
  }
  enrich() {
    if(this.pending)return this.pending;
    this.pending=this.run().catch(error=>({error:error.message})).finally(()=>{this.pending=null;});return this.pending;
  }
  async run() {
    const games=this.library.list().filter(g=>!g.missing && (
      ((!releaseYear(g.metadata) || !g.metadata.cover) && Date.now()-(g.metadata.launchboxCheckedAt||0)>7*day) ||
      (!gameCategory(g.metadata) && Date.now()-(g.metadata.genreCheckedAt||0)>7*day)));
    if(!games.length)return {years:0,matches:0};
    const index=await this.index();let years=0,matches=0,genres=0;
    for(const game of games) {
      await yieldTurn();
      let current;try{current=this.library.get(game.id);}catch{continue;}
      const match=matchLaunchbox(current,index);
      const update={launchboxCheckedAt:Date.now(),genreCheckedAt:Date.now()};
      if(match) {
        matches++;update.launchboxId=match.id;update.launchboxTitle=match.title;
        if(!releaseYear(current.metadata) && match.year){update.released=match.year;update.yearSource='LaunchBox Games Database';update.yearMatch='console and exact title or alias';update.yearMatchedName=match.title;years++;}
        if(!gameCategory(current.metadata) && gameCategory({genre:match.genre})) {update.genre=match.genre;update.genreSource='LaunchBox Games Database';genres++;}
      }
      this.library.updateMetadata(game.id,update);
    }
    return {years,matches,genres};
  }
  async cover(id) {
    if(this.covers.has(id))return this.covers.get(id);
    const task=this.coverWork(id).catch(()=>null).finally(()=>this.covers.delete(id));this.covers.set(id,task);return task;
  }
  async coverWork(id) {
    let game=this.library.get(id);
    if(game.metadata.cover && fs.existsSync(game.metadata.cover))return game.metadata.cover;
    if(game.missing || Date.now()-(game.metadata.launchboxCoverCheckedAt||0)<7*day || Date.now()<this.retryAfter)return null;
    if(this.active>=3)await new Promise(resolve=>this.waiters.push(resolve));else this.active++;
    try {
      const match=matchLaunchbox(game,await this.index());
      const region=/\((?:J|Japan)\)/.test(game.relative_path)?'Japan':/\((?:E|Europe)\)/.test(game.relative_path)?'Europe':'North America';
      const cover=match?.covers.find(c=>c.region===region)||match?.covers[0];
      if(!cover){this.library.updateMetadata(id,{launchboxCoverCheckedAt:Date.now()});return null;}
      const bytes=await boundedDownload(`https://images.launchbox-app.com/${cover.file}`,10*1024*1024);
      const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpg=bytes[0]===255 && bytes[1]===216;
      if(!png&&!jpg)throw Object.assign(new Error('Invalid LaunchBox cover'),{localImageError:true});
      game=this.library.get(id);
      if(game.metadata.cover && fs.existsSync(game.metadata.cover))return game.metadata.cover;
      const dir=path.join(this.library.dataDir,'media');fs.mkdirSync(dir,{recursive:true});
      const file=path.join(dir,`${id}-launchbox.${png?'png':'jpg'}`);fs.writeFileSync(file,bytes);
      this.library.updateMetadata(id,{cover:file,coverSource:'LaunchBox Games Database',coverMatch:match.title,launchboxId:match.id,launchboxCoverCheckedAt:Date.now()});
      return file;
    } catch(error) {
      this.lastError=`${game.title}: ${error.message}`;
      // A stale image link is local to this game, not an outage of the provider.
      if(error.status===404 || error.status===410 || error.localImageError)this.library.updateMetadata(id,{launchboxCoverCheckedAt:Date.now()});
      else this.retryAfter=Date.now()+60000;
      throw error;
    }
    finally{const next=this.waiters.shift();if(next)next();else this.active--;}
  }
}
