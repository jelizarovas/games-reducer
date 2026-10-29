import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
fs.mkdirSync('test-results/layout', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  // Exercise browsing without changing the user's persisted selection.
  await page.route('**/api/current', route => route.fulfill({ json: { ok: true } }));
  await page.addInitScript(() => {
    window.layoutPad = { id:'Layout controller',connected:true,index:0,mapping:'standard',axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0})) };
    navigator.getGamepads = () => [window.layoutPad];
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.LAYOUT_URL || 'http://127.0.0.1:3001/');
  await page.locator('.game-row').first().waitFor();
  for (const [name, width, height] of [['desktop',1440,900], ['tablet',1024,768], ['mobile',390,844], ['small-phone',320,568], ['landscape',844,390]]) {
    await page.setViewportSize({width,height});
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}; };
      const list = document.querySelector('.game-list');
      return {screen:rect('.screen'),dock:rect('.sidebar'),main:rect('main'),pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,position:getComputedStyle(document.querySelector('.sidebar')).position,horizontal:list.scrollWidth>list.clientWidth+2};
    });
    assert.ok(Math.abs(metrics.screen.width / metrics.screen.height - 4/3) < .01, `${name}: game ratio`);
    assert.ok(metrics.pageWidth <= width + 1 && metrics.pageHeight <= height + 1, `${name}: page overflow`);
    if(width<=900) {
      assert.equal(metrics.position,'fixed');
      assert.ok(Math.abs(metrics.dock.bottom-height)<1,`${name}: bottom dock`);
      assert.ok(metrics.screen.bottom<=metrics.dock.y+1,`${name}: game overlaps dock`);
      assert.ok(metrics.horizontal,`${name}: horizontal game list`);
      if(name==='mobile') {
        const selected=await page.locator('.game-row.selected').getAttribute('aria-label');
        await page.keyboard.press('ArrowRight');
        assert.notEqual(await page.locator('.game-row.selected').getAttribute('aria-label'),selected,'Right arrow traverses dock');
        await page.evaluate(()=>{window.layoutPad.buttons[14].pressed=true;});
        await page.waitForTimeout(150);
        await page.evaluate(()=>{window.layoutPad.buttons[14].pressed=false;});
        await page.waitForTimeout(150);
        assert.equal(await page.locator('.game-row.selected').getAttribute('aria-label'),selected,'Controller left traverses dock');
      }
      await page.locator('.game-list').evaluate(el => { el.scrollLeft = 300; });
      assert.ok(await page.locator('.game-list').evaluate(el => el.scrollLeft>0));
    }
    await page.screenshot({path:`test-results/layout/${name}.png`});
    console.log('PASS',name,JSON.stringify(metrics));
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Toggle fullscreen'}).click();
  const fullscreen=await page.locator('.screen').boundingBox();
  assert.ok(Math.abs(fullscreen.width/fullscreen.height-4/3)<.01);
  await page.screenshot({path:'test-results/layout/fullscreen.png'});
  await page.getByRole('button',{name:'Toggle fullscreen'}).click();
  await page.getByRole('button',{name:'Game information',exact:true}).click();
  await page.getByRole('dialog',{name:'Game information'}).waitFor();
  await page.getByRole('button',{name:'Close dialog'}).click();
  assert.deepEqual(errors,[]);
  console.log('PASS fullscreen ratio, info dialog, zero browser errors');
} finally { await browser.close(); }
