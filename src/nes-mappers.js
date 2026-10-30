// JSNES 2.1 exposes no mapper-registration API. Use its shipped ESM registry;
// this is the same module used by ROM.createMapper, without modifying node_modules.
import Mappers from '../node_modules/jsnes/src/mappers/index.js';
import Mapper0 from '../node_modules/jsnes/src/mappers/mapper0.js';
// Share the same ESM graph in Vite dev as well as production. Importing the
// optimized bare "jsnes" package would give dev a separate mapper registry.
export { default as Browser } from '../node_modules/jsnes/src/browser/index.js';
export { default as Controller } from '../node_modules/jsnes/src/controller.js';

// Taito TC0190/TC0350 (iNES 33). Register decoding verified against:
// https://github.com/SourMesen/Mesen2/blob/master/Core/NES/Mappers/Taito/TaitoTc0190.h
export class Mapper33 extends Mapper0 {
  static mapperName = 'Taito TC0190';

  loadPRGROM() {
    this.loadRomBank(0, 0x8000);
    this.loadRomBank(this.nes.rom.romCount - 1, 0xc000);
  }

  write(address, value) {
    if (address < 0x8000) { super.write(address, value); return; }
    const register = address & 0xa003;
    if (register === 0x8000 || register === 0x8001) {
      this.load8kRomBank(value & 0x3f, 0x8000 + (register & 1) * 0x2000);
      if (register === 0x8000) {
        const rom = this.nes.rom;
        this.nes.ppu.setMirroring(value & 0x40 ? rom.HORIZONTAL_MIRRORING : rom.VERTICAL_MIRRORING);
      }
    } else if (register === 0x8002 || register === 0x8003) {
      this.load2kVromBank(value, (register - 0x8002) * 0x800);
    } else {
      this.load1kVromBank(value, 0x1000 + (register & 3) * 0x400);
    }
  }
}

Mappers[33] = Mapper33;
export const supportedNesMappers = Object.keys(Mappers).map(Number).sort((a,b)=>a-b);
