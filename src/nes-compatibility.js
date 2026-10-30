import {supportedNesMappers} from './nes-mappers.js';
import {decodeRom,extension,LIMIT} from './browser-core.js';

export const COMPATIBILITY_VERSION=`jsnes-2.1-header-v1:${supportedNesMappers.join(',')}`;
const supported=new Set(supportedNesMappers);
export const isBlocked=game=>['unsupported','invalid'].includes(game?.compatibility?.status);
export const canQueue=game=>!game.missing&&!isBlocked(game);
export function compatibilityLabel(game){
  const check=game?.compatibility;
  return check?.status==='unsupported'?`Unsupported mapper ${check.mapper}`:check?.status==='invalid'?'Invalid ROM':check?.status==='unchecked'?'Not checked':'';
}

export function inspectNesHeader(header,size){
  const result={version:COMPATIBILITY_VERSION};
  const invalid=reason=>({...result,status:'invalid',reason});
  if(header.length<16||header[0]!==0x4e||header[1]!==0x45||header[2]!==0x53||header[3]!==0x1a)return invalid('Missing or invalid NES cartridge header.');
  const nes2=(header[7]&12)===8;
  let mapper=(header[6]>>4)|(header[7]&0xf0);
  const dirtyHeader=!nes2&&header.slice(8,16).some(value=>value!==0);
  if(nes2)mapper|=(header[8]&15)<<8;
  else if(dirtyHeader)mapper&=15; // Match JSNES's legacy-header handling exactly.
  Object.assign(result,{mapper,submapper:nes2?header[8]>>4:0,format:nes2?'NES 2.0':'iNES',dirtyHeader});
  const bankSize=(lsb,msb,unit)=>msb===15?2**(lsb>>2)*((lsb&3)*2+1):((msb<<8)|lsb)*unit;
  const prg=bankSize(header[4],nes2?header[9]&15:0,16384),chr=bankSize(header[5],nes2?header[9]>>4:0,8192);
  if(!prg)return invalid('NES cartridge has no program ROM.');
  if(16+(header[6]&4?512:0)+prg+chr>size)return invalid('NES cartridge is shorter than the sizes in its header.');
  return {...result,status:supported.has(mapper)?'supported':'unsupported',reason:supported.has(mapper)?'Mapper supported; gameplay has not been verified.':`The NES engine does not support mapper ${mapper}.`};
}

export async function inspectNesFile(file){
  if(file.size>LIMIT)return {version:COMPATIBILITY_VERSION,status:'invalid',reason:'ROM exceeds the 64 MB cartridge limit.'};
  try{
    if(extension(file.name)==='.zip'){
      const {bytes}=decodeRom(new Uint8Array(await file.arrayBuffer()),file.name,'nes');
      return inspectNesHeader(bytes.subarray(0,16),bytes.length);
    }
    return inspectNesHeader(new Uint8Array(await file.slice(0,16).arrayBuffer()),file.size);
  }catch(error){return {version:COMPATIBILITY_VERSION,status:'invalid',reason:error.message};}
}

export function compatibilityReport(games){
  const entries=games.filter(g=>g.system==='nes'&&!g.missing).map(g=>({title:g.title,path:g.relative_path,...(g.compatibility||{status:'unchecked',reason:'Reconnect and rescan the ROM folder.'})}));
  const counts={total:entries.length,supported:0,unsupported:0,invalid:0,unchecked:0};
  for(const game of entries)counts[game.status]++;
  return {checkedAt:new Date().toISOString(),engine:COMPATIBILITY_VERSION,note:'Header and mapper checks only; supported does not certify gameplay.',counts,games:entries};
}
