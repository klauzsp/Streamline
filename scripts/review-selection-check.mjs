import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH});
try {
 const page = await browser.newPage();
 await page.goto('http://127.0.0.1:3000');
 await page.getByRole('button',{name:'Try the 3-minute demo'}).click();
 await page.getByRole('button',{name:'Review the two decisions'}).click();
 await page.locator('.gd-alternate summary').click();
 const select = page.getByLabel('Alternative target record');
 await select.locator('option').nth(2).waitFor({state:'attached'});
 const options = await select.locator('option').evaluateAll(nodes => nodes.map(n=>({value:n.value,label:n.textContent})));
 const current = await select.inputValue();
 const alternative = options.find(o=>o.value && o.value!==current);
 await page.getByRole('checkbox').check();
 await select.selectOption(alternative.value);
 assert.equal(await page.getByRole('checkbox').isChecked(),false);
 assert.ok((await page.locator('.gd-proposal h3').innerText()).includes(alternative.label));
 await page.route('**/api/migrations/*', async route => {
  const req=route.request();
  if(req.method()!=='POST' || req.postDataJSON().action!=='investigate') return route.continue();
  const input=req.postDataJSON();
  const state=await page.evaluate(async url=>(await fetch(url)).json(),req.url());
  state.migration.suggestions[input.mappingId]={candidates:[],explanation:'TEST: insufficient evidence',provider:'Gemini · test'};
  await route.fulfill({json:state});
 });
 await page.getByRole('button',{name:'Investigate with Gemini',exact:true}).click();
 await page.getByText('TEST: insufficient evidence',{exact:true}).waitFor();
 assert.equal(await select.inputValue(),'');
 assert.equal(await page.getByRole('button',{name:'Use the operations record',exact:true}).isDisabled(),true);
 console.log('Review selection passed: alternative copy agrees, confirmation resets, abstention clears target and blocks approval.');
} finally { await browser.close(); }
