import {chromium} from '../worker/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,chromiumSandbox:false});
const base=process.env.TEST_APP_URL||'http://127.0.0.1:3100';
const errors=[];
try {
 for(const [name,width,height] of [['desktop',1440,1080],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});
  assert(await page.getByRole('button',{name:'Capture Website',exact:true}).isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Horizontal overflow');
  await page.getByRole('button',{name:'Mobile',exact:true}).click();
  assert.equal(await page.getByLabel('Device resolution').inputValue(),'mobile-390');
  await page.getByRole('button',{name:'Record website',exact:true}).click();
  await page.getByRole('button',{name:'15s',exact:true}).click();
  assert.equal(await page.getByLabel('Custom seconds').inputValue(),'15');
  await page.getByRole('button',{name:'Screenshot',exact:true}).click();
  await page.getByRole('button',{name:name==='desktop'?'Desktop':'Mobile',exact:true}).click();
  await page.getByLabel('Website URL',{exact:true}).fill('https://example.com');
  await page.screenshot({path:`artifacts/ui-${name}.png`,fullPage:true});
  await page.getByRole('button',{name:'Advanced settings',exact:true}).click();
  await page.getByRole('switch',{name:'Hide common cookie popups',exact:false}).check();
  await page.getByRole('switch',{name:'Hide common cookie popups',exact:false}).uncheck();
  await page.getByRole('button',{name:'Advanced settings',exact:true}).click();
  if(name==='mobile'){
    await page.getByLabel('Website URL',{exact:true}).fill('http://127.0.0.1');
    await page.getByRole('button',{name:'Capture Website',exact:true}).click();
    await page.getByRole('button',{name:'Retry capture',exact:true}).waitFor({timeout:45000});
    assert.match(await page.locator('.error-box[role=alert]').textContent(),/private|local|reserved/i);
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile('artifacts/ui-tests.json',JSON.stringify({status:'passed',viewports:['1440x1080','390x844'],checks:['No horizontal overflow','Device and video controls','Advanced settings','Real backend SSRF error and retry state','No client runtime errors']},null,2));
 console.log('UI checks passed at desktop and mobile sizes.');
} finally {await browser.close();}
