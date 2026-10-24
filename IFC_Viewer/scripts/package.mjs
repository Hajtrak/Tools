import { mkdir, cp, rename, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const root = process.cwd();
const target = path.resolve('release/IFC Viewer');
const staging = path.resolve('release/application');
await mkdir(target, { recursive: true });
await cp('node_modules/electron/dist', target, { recursive: true });
await rename(path.join(target,'electron.exe'),path.join(target,'IFC Viewer.exe'));
// Generated staging must not retain obsolete bundles from previous builds.
if(path.dirname(staging)!==path.join(root,'release')||path.basename(staging)!=='application')throw new Error('Invalid staging directory');
await rm(staging,{recursive:true,force:true});
await mkdir(staging,{recursive:true});
await cp('dist',path.join(staging,'dist'),{recursive:true});
await cp('electron',path.join(staging,'electron'),{recursive:true});
const pkg=JSON.parse(await readFile('package.json','utf8'));
await writeFile(path.join(staging,'package.json'),JSON.stringify({name:pkg.name,productName:pkg.productName,version:pkg.version,main:pkg.main,description:pkg.description,license:'MIT'},null,2));
await asar.createPackage(staging,path.join(target,'resources/app.asar'));
// Retain the original Electron/Chromium license files and add bundled dependency notices.
const visited=new Set();let notices='IFC Viewer — bundled open-source components\n\n';
async function visit(name,base=root){
 let dir=path.join(base,'node_modules',name);
 try{await readFile(path.join(dir,'package.json'));}catch{dir=path.join(root,'node_modules',name)}
 if(visited.has(dir))return;visited.add(dir);
 const data=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));
 notices+=`\n${data.name} ${data.version}\nLicense: ${typeof data.license==='string'?data.license:JSON.stringify(data.license||'See notices')}\n`;
 for(const file of await readdir(dir))if(/^(license|copying|notice)(\.|$)/i.test(file))try{notices+=await readFile(path.join(dir,file),'utf8')+'\n'}catch{}
 for(const dep of Object.keys(data.dependencies||{}))await visit(dep,dir);
}
for(const name of Object.keys(pkg.dependencies))await visit(name);
await writeFile(path.join(target,'THIRD-PARTY-NOTICES.txt'),notices);
console.log('Portable app:',target);

await cp('../LICENSE',path.join(target,'LICENSE.txt'));
