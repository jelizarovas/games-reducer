// Explicit No-Intro language tags / GoodTools translations take precedence over
// region estimates. A regional release is not a guarantee of its text language.
export const languageNames={en:'English',ja:'Japanese',zh:'Chinese',ko:'Korean',fr:'French',de:'German',es:'Spanish',it:'Italian',pt:'Portuguese',ru:'Russian',nl:'Dutch',sv:'Swedish',da:'Danish',fi:'Finnish',no:'Norwegian',pl:'Polish'};
const aliases={eng:'en',english:'en',jpn:'ja',japanese:'ja',chi:'zh',chinese:'zh',kor:'ko',korean:'ko',fre:'fr',fra:'fr',french:'fr',ger:'de',deu:'de',german:'de',spa:'es',spanish:'es',ita:'it',italian:'it',por:'pt',portuguese:'pt',rus:'ru',russian:'ru',dut:'nl',dutch:'nl'};
const code=value=>{const normalized=String(value).trim().toLowerCase().replace(/[_-].*$/,'');return Object.hasOwn(languageNames,normalized)?normalized:Object.hasOwn(aliases,normalized)?aliases[normalized]:undefined;};
const unique=values=>[...new Set(values.filter(Boolean))];
const regions={u:'en',usa:'en',us:'en',uk:'en','united kingdom':'en',a:'en',australia:'en',e:'en',europe:'en',w:'en',world:'en',j:'ja',japan:'ja',jp:'ja',f:'fr',france:'fr',g:'de',germany:'de',s:'es',spain:'es',i:'it',italy:'it',b:'pt',brazil:'pt',r:'ru',russia:'ru',k:'ko',korea:'ko',ch:'zh',china:'zh',taiwan:'zh','ch-simple':'zh','sachen-chinese':'zh','sachen-jap':'ja'};
export function gameLanguages(game){
  const filename=String(game.relative_path||'').split(/[\\/]/).pop();
  const translations=[...filename.matchAll(/\[T([+-])([a-z]{2,8})(?=[_\d\]. -])/gi)];
  const translated=unique(translations.map(match=>code(match[2])));
  if(translated.length)return {codes:translated,source:translations.some(match=>match[1]==='-')?'Partial translation tag':'Translation tag',estimated:false};
  const raw=game.metadata?.languages||game.metadata?.language||'';
  const metadata=unique((Array.isArray(raw)?raw:String(raw).split(/[,;|/]/)).map(code));
  if(metadata.length)return {codes:metadata,source:'Language metadata',estimated:false};
  const tags=[...filename.matchAll(/\(([^)]+)\)/g)].map(match=>match[1]);
  const explicit=unique(tags.flatMap(tag=>{const parts=tag.split(/[,;+]/).map(code);return parts.every(Boolean)?parts:[];}));
  if(explicit.length)return {codes:explicit,source:'Language tag',estimated:false};
  const inferred=unique(tags.flatMap(tag=>tag.toLowerCase().split(/,\s*/).flatMap(region=>/^[jue]{2,3}$/.test(region)?[...region].map(part=>regions[part]):[Object.hasOwn(regions,region.trim())?regions[region.trim()]:undefined])));
  return {codes:inferred,source:inferred.length?'Estimated from region':'Unknown',estimated:!!inferred.length};
}
export function normalizeLanguages(value){
  if(typeof value==='string'){try{value=JSON.parse(value);}catch{/* Migrate the original single-language preference. */}}
  if(!Array.isArray(value))value=[value];
  const valid=unique(value.filter(v=>v==='all'||v==='unknown'||Object.hasOwn(languageNames,v)));
  return valid.includes('all')?['all']:valid;
}
export function readLanguages(value){return value===null?['all']:normalizeLanguages(value);}
export function toggleLanguage(value,choice){
  if(choice==='all')return ['all'];
  const selected=normalizeLanguages(value).filter(v=>v!=='all');
  return selected.includes(choice)?selected.filter(v=>v!==choice):[...selected,choice];
}
export function languageLabel(value){const selected=normalizeLanguages(value);return selected.includes('all')?'All languages':selected.length?selected.map(v=>v==='unknown'?'Unknown':languageNames[v]).join(' + '):'No languages';}
export function matchesLanguage(game,language){const selected=normalizeLanguages(language);if(selected.includes('all'))return true;const {codes}=gameLanguages(game);return !codes.length?selected.includes('unknown'):codes.some(code=>selected.includes(code));}
export function languageDetails(game){const result=gameLanguages(game);return result.codes.length?`${result.codes.map(code=>languageNames[code]).join(', ')} · ${result.source}`:'Unknown';}
export const languageOptions=games=>[{value:'all',label:'All languages'},{value:'en',label:'English'},...[...new Set(games.flatMap(game=>gameLanguages(game).codes))].filter(code=>code!=='en').sort((a,b)=>languageNames[a].localeCompare(languageNames[b])).map(value=>({value,label:languageNames[value]})),{value:'unknown',label:'Unknown'}];
