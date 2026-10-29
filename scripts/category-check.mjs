import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {matchesCategory} from '../src/library-view.js';
const all=await(await fetch('http://127.0.0.1:3001/api/games')).json();
const fixture=['nes','snes','megadrive'].flatMap(system=>['Puzzle','Platformer'].map(category=>all.find(g=>g.system===system&&matchesCategory(g,category)&&!g.missing)));
assert.ok(fixture.every(Boolean));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.route('**/api/games',r=>r.fulfill({json:fixture.map(g=>({...g,status:'unreviewed'}))}));
 await page.route('**/api/current',r=>r.fulfill({json:{ok:true}}));
 await page.goto('http://127.0.0.1:3001/');await page.locator('.game-row').first().waitFor();
 const choose=async(label,option)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();};
 for(const category of ['Puzzle','Platformer']){
  await choose('Game category',category);
  assert.equal(await page.locator('.game-row').count(),fixture.filter(g=>matchesCategory(g,category)).length);
  const metadata=await page.locator('.row-meta').allTextContents();
  for(const console of ['NES','SNES','Genesis'])assert.ok(metadata.some(text=>text.includes(console)));
 }
 await choose('Console','SNES');assert.equal(await page.locator('.game-row').count(),1);
 assert.match(await page.locator('.row-meta').textContent(),/SNES/);
 await page.getByRole('textbox',{name:'Find a game'}).fill('no such title');assert.equal(await page.locator('.game-row').count(),0);
 await page.getByRole('textbox',{name:'Find a game'}).fill('');
 await choose('Console','All');await choose('Game category','All categories');assert.equal(await page.locator('.game-row').count(),6);
 for(const [width,height] of [[1440,900],[390,844],[844,390]]){
  await page.setViewportSize({width,height});await page.getByRole('combobox',{name:'Game category',exact:true}).click();
  const box=await page.getByRole('listbox',{name:'Game category',exact:true}).boundingBox();
  assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
  await page.screenshot({path:`test-results/layout/category-${width}.png`});await page.keyboard.press('Escape');
  assert.ok(await page.locator('.game-list').evaluate(el=>el.clientHeight)>30);
 }
 console.log('PASS category across all three consoles, console/search combinations, reset, desktop/mobile dropdown bounds');
}finally{await browser.close();}
