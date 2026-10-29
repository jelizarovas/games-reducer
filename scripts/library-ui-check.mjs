import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.route('**/api/current',r=>r.fulfill({json:{ok:true}}));
 await page.goto('http://127.0.0.1:3001/');await page.locator('.game-row').first().waitFor();
 assert.equal(await page.locator('select').count(),0);
 const list=page.locator('.game-list'),title=await page.locator('.header-title').textContent();
 await list.evaluate(el=>{el.scrollTop=0;});await page.waitForTimeout(200);
 const first=await page.locator('.game-row').first().getAttribute('aria-label');
 for(const offset of [10000,50000,200000,100000,1000,0]) {
  await list.evaluate((el,y)=>{el.scrollTop=y;},offset);await page.waitForTimeout(200);
  const before=await list.evaluate(el=>el.scrollTop);await page.waitForTimeout(250);
  assert.equal(await list.evaluate(el=>el.scrollTop),before,'Scrolling must not jump when rows render');
  assert.ok(await page.locator('.game-row').count()<60,'Windowed list stays bounded');
  assert.equal(await page.locator('.header-title').textContent(),title,'Scrolling leaves active game alone');
 }
 assert.equal(await page.locator('.game-row').first().getAttribute('aria-label'),first);
 assert.equal(await page.getByRole('button',{name:'Earlier games',exact:true}).count(),0);
 assert.equal(await page.getByText('Year unknown',{exact:false}).count(),0);
 console.log('PASS: both-direction continuous scroll, stable position, bounded rows, active title retained');
 await page.getByRole('combobox',{name:'Sort games',exact:true}).click();
 const panel=page.getByRole('listbox',{name:'Sort games',exact:true});await panel.waitFor();
 const sizes=await panel.evaluate(el=>({padding:getComputedStyle(el).padding,width:el.clientWidth,items:[...el.children].map(b=>b.getBoundingClientRect().width)}));
 assert.equal(sizes.padding,'0px');assert.ok(sizes.items.every(w=>Math.abs(w-sizes.width)<1));
 await page.keyboard.press('End');assert.equal(await page.locator(':focus').textContent(),'Newest first');
 await page.keyboard.press('Escape');assert.equal(await panel.count(),0);
 await page.getByRole('combobox',{name:'Review status',exact:true}).click();await page.locator('.header-title').click();assert.equal(await page.getByRole('listbox').count(),0);
 await page.getByRole('button',{name:'More actions',exact:true}).click();
 assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Undo last decision','Controller menu','Library settings','Finish session']);
 await page.screenshot({path:'test-results/layout/dropdown-desktop.png'});await page.keyboard.press('Escape');
 for(const [width,height] of [[390,844],[320,568],[844,390]]) {
  await page.setViewportSize({width,height});await page.waitForTimeout(200);
  const trigger=page.getByRole('combobox',{name:'Review status',exact:true});await trigger.click();
  const box=await page.getByRole('listbox').boundingBox(),control=await trigger.boundingBox();
  assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=height,'Dropdown stays on screen');
  assert.ok(box.y+box.height<=control.y,'Bottom dock dropdown opens above');
  if(width===390)await page.screenshot({path:'test-results/layout/dropdown-mobile.png'});
  await page.keyboard.press('Escape');
  await list.evaluate(el=>{el.scrollLeft=10000;});await page.waitForTimeout(150);assert.ok(await list.evaluate(el=>el.scrollLeft)>9000);
  await list.evaluate(el=>{el.scrollLeft=0;});await page.waitForTimeout(150);assert.equal(await list.evaluate(el=>el.scrollLeft),0);
 }
 console.log('PASS: full-width dropdown rows, keyboard, clickaway, overflow actions, mobile popup and horizontal scroll');
} finally {await browser.close();}
