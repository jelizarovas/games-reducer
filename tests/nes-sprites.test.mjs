import assert from 'node:assert/strict';
import test from 'node:test';
import NES from '../node_modules/jsnes/src/nes.js';
import {fixNesSpriteTiles} from '../src/nes-sprites.js';
for(const table of [0,1])for(const flipY of [false,true])for(const flipX of [false,true])test(`8x16 sprite pixels table ${table}, flips ${flipX}/${flipY}`,()=>{
 const nes=new NES({emulateSound:false});nes.mmap={latchAccess(){}};fixNesSpriteTiles(nes);const p=nes.ppu;p.f_spriteSize=1;p.f_spVisibility=1;p.buffer.fill(0);p.pixrendered.fill(65);p.sprPalette[1]=0x112233;p.sprPalette[2]=0x445566;
 const top=table*256+2;for(let y=0;y<8;y++)for(let x=0;x<8;x++){p.ptTile[top].pix[y*8+x]=x<4?1:2;p.ptTile[top+1].pix[y*8+x]=y<4?2:1;}
 for(let scan=20;scan<36;scan++){p.scanlineSpriteCount[scan]=1;p.scanlineSecondaryOAM.set([19,2+table,(flipY?128:0)|(flipX?64:0),24],scan*32);}
 p.renderSpritesPartially(20,16,0);
 for(let y=0;y<16;y++)for(let x=0;x<8;x++){const sy=flipY?15-y:y,sx=flipX?7-x:x;const color=sy<8?(sx<4?1:2):(sy<12?2:1);assert.equal(p.buffer[(20+y)*256+24+x],p.sprPalette[color],`pixel ${x},${y}`);}
});
test('8x8 path is unchanged and priority passes do not double render',()=>{const nes=new NES();let calls=0;nes.ppu.renderSpritesPartially=()=>calls++;fixNesSpriteTiles(nes);nes.ppu.f_spriteSize=0;nes.ppu.renderSpritesPartially(0,1,0);assert.equal(calls,1);nes.ppu.f_spriteSize=1;nes.ppu.f_spVisibility=0;nes.ppu.renderSpritesPartially(0,1,0);assert.equal(calls,1);});
