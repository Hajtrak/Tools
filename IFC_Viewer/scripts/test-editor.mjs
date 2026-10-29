import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,unlink} from 'node:fs/promises';
const app=await electron.launch({executablePath:path.resolve('node_modules/electron/dist/electron.exe'),args:['.','--viewer-test'],env:{...process.env,IFC_TEST_PROFILE:path.resolve('.cache/editor-profile')},timeout:30000});
try{
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.hide()));
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>window.viewerTest);
 await page.evaluate(()=>localStorage.removeItem('ifc-viewer-fields-v2'));await page.reload();await page.waitForFunction(()=>window.viewerTest);
 await page.evaluate(bytes=>window.viewerTest.openBytes('synthetic.ifc',bytes),Array.from(await readFile('.cache/synthetic.ifc')));
 assert.equal(await page.evaluate(()=>window.viewerTest.state().error),null);
 const rows=await page.evaluate(()=>window.viewerTest.rows());assert.equal(rows.length,2,'Non-geometric elements are included');
 assert(await page.locator('#table-head').innerText().then(t=>t.includes('Custom Mass XYZ')));
 assert.equal(await page.locator('#group-summary').innerText(),'');
 await page.click('#select-matching');await page.click('#edit-properties');await page.fill('#property-name','Notes');await page.fill('#property-value','Bulk editor test');await page.click('#property-form button[type=submit]');
 assert((await page.evaluate(()=>window.viewerTest.rows())).every(r=>r.values['Pset_ViewerCustom · Notes']==='Bulk editor test'));
 await page.click('#list-fields');await page.fill('#field-search','Custom Mass XYZ');assert.equal(await page.locator('#field-options input:checked').count(),1);await page.locator('#field-options input').uncheck();await page.click('#fields-close');assert(!(await page.locator('#table-head').innerText()).includes('Custom Mass XYZ'));
 const target=path.resolve('.cache/editor-export.ifc');await unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e;});
 await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},target);
 await page.click('#save-ifc');await page.waitForFunction(()=>document.querySelector('#edit-count').textContent.startsWith('Saved '));assert((await readFile(target)).length>0);
 const saved=await readFile(target);await page.click('#save-ifc');await page.waitForFunction(()=>window.viewerTest.state().error?.includes('Choose a new filename'));assert.deepEqual(await readFile(target),saved,'Existing IFC cannot be overwritten');
 await page.evaluate(bytes=>window.viewerTest.openBytes('saved.ifc',bytes),Array.from(saved));assert((await page.evaluate(()=>window.viewerTest.rows())).every(r=>r.values['Pset_ViewerCustom · Notes']==='Bulk editor test'));
 assert.deepEqual(errors,[]);console.log('Electron integration passed: IFC load, all columns, no grouping, non-geometric rows, bulk property editor, column selection and native IFC save.');
}finally{await app.close();}
