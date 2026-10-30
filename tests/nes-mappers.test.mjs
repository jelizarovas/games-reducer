import test from 'node:test';
import assert from 'node:assert/strict';
import { NES } from 'jsnes';
import '../src/nes-mappers.js';

function cartridge() {
  const bytes = new Uint8Array(16 + 4 * 16384 + 4 * 8192);
  bytes.set([0x4e,0x45,0x53,0x1a,4,4,0x10,0x20]);
  for(let bank=0;bank<8;bank++)bytes.fill(bank,16+bank*8192,16+(bank+1)*8192);
  for(let bank=0;bank<32;bank++)bytes.fill(bank,16+65536+bank*1024,16+65536+(bank+1)*1024);
  return bytes;
}

test('mapper 33 loads fixed vectors, banked PRG and mirrored register writes',()=>{
  const nes=new NES();nes.loadROM(cartridge());
  assert.equal(nes.rom.mapperType,33);
  const banks=()=>[0x8000,0xa000,0xc000,0xe000].map(a=>nes.cpu.mem[a]);
  assert.deepEqual(banks(),[0,1,6,7]);
  nes.mmap.write(0x9000,0x43);nes.mmap.write(0xd001,5);
  assert.deepEqual(banks(),[3,5,6,7]);
  assert.equal(nes.ppu.currentMirroring,nes.rom.HORIZONTAL_MIRRORING);
  nes.mmap.write(0xc000,2);
  assert.equal(nes.ppu.currentMirroring,nes.rom.VERTICAL_MIRRORING);
  nes.mmap.write(0x0007,123);assert.equal(nes.cpu.mem[7],123);
});

test('mapper 33 selects two 2 KiB and four 1 KiB CHR banks independently',()=>{
  const nes=new NES();nes.loadROM(cartridge());
  nes.mmap.write(0x8002,3);nes.mmap.write(0xc003,5);
  for(let i=0;i<4;i++)nes.mmap.write(0xe000+i,20+i);
  assert.deepEqual(Array.from({length:8},(_,i)=>nes.ppu.vramMem[i*1024]),[6,7,10,11,20,21,22,23]);
  const saved=nes.toJSON();nes.mmap.write(0x8000,5);nes.fromJSON(saved);
  assert.equal(nes.cpu.mem[0x8000],0);
  assert.deepEqual(Array.from({length:8},(_,i)=>nes.ppu.vramMem[i*1024]),[6,7,10,11,20,21,22,23]);
});
