// JSNES 2.1's 8x16 renderer subtracts one from the already-even tile index
// when selecting pattern table 1. NES tile bit 0 selects the table; bits 1-7
// select the even top tile. Preserve the existing 8x8 path and sprite timing.
// https://www.nesdev.org/wiki/PPU_OAM#Byte_1_-_Tile/index
export function fixNesSpriteTiles(nes){
  const ppu=nes.ppu,render=ppu.renderSpritesPartially;
  ppu.renderSpritesPartially=function(start,count,priority){
    if(this.f_spriteSize===0)return render.call(this,start,count,priority);
    if(this.f_spVisibility!==1)return;
    for(let scan=Math.max(0,start);scan<Math.min(240,start+count);scan++){
      for(let slot=0;slot<this.scanlineSpriteCount[scan];slot++){
        const offset=scan*32+slot*4,oam=this.scanlineSecondaryOAM;
        const y=oam[offset]+1,tile=oam[offset+1],attributes=oam[offset+2],x=oam[offset+3];
        const row=scan-y,flipY=!!(attributes&128);
        if(row<0||row>=16||((attributes>>5)&1)!==priority)continue;
        const table=(tile&1)*256,top=tile&254,half=row>>3;
        const index=table+top+(flipY?1-half:half);
        this.ptTile[index].render(this.buffer,0,row&7,8,(row&7)+1,x,y+half*8,
          (attributes&3)*4,this.sprPalette,!!(attributes&64),flipY,slot,this.pixrendered);
        const address=(tile&1)*4096+top*16;
        this.nes.mmap.latchAccess(address+8);
        this.nes.mmap.latchAccess(address+24);
      }
    }
  };
}
