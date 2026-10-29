import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync} from 'fflate';
import {safePath,identity,validateBackup,decodeRom,LIMIT,safeMetadata} from '../src/browser-core.js';
const record={system:'nes',relative_path:'nes/Mario.nes',size:16,status:'keep',seconds:10,metadata:{genre:'Platformer'}};
const backup=games=>({format:'games-reducer-backup',version:1,games});
test('portable identities and backups do not depend on a Windows folder path',()=>{
  assert.equal(identity({...record,relative_path:'nes\\Mario.nes'}),identity(record));
  assert.equal(validateBackup(backup([record])).games[0].status,'keep');
});
test('backup validation rejects traversal, invalid statuses, duplicate entries, and oversized ROMs',()=>{
  for(const path of ['../foo','C:\\roms\\game.nes','/tmp/game.nes','nes//x','nes/../x'])assert.throws(()=>safePath(path));
  for(const patch of [{system:'ps1'},{status:'deleted'},{seconds:-1},{size:LIMIT+1},{size:NaN}])assert.throws(()=>validateBackup(backup([{...record,...patch}])));
  assert.throws(()=>validateBackup(backup([record,record])));
  assert.throws(()=>validateBackup({...backup([record]),version:20}));
  assert.equal(safeMetadata({cover:'https://evil.invalid/x',description:'text',root:'C:/secret'}).cover,undefined);
  assert.equal(safeMetadata({root:'C:/secret'}).root,undefined);
});
test('ZIP cartridge reader rejects ambiguous archives and preserves the actual ROM filename',()=>{
  const one=decodeRom(zipSync({'folder/Mario.nes':new Uint8Array([1,2,3]),'readme.txt':new Uint8Array([4])}),'game.zip','nes');
  assert.equal(one.name,'Mario.nes');assert.deepEqual([...one.bytes],[1,2,3]);
  assert.throws(()=>decodeRom(zipSync({'a.nes':new Uint8Array([1]),'b.nes':new Uint8Array([2])}),'game.zip','nes'));
  assert.throws(()=>decodeRom(zipSync({'a.bin':new Uint8Array([1])}),'game.zip','nes'));
});
