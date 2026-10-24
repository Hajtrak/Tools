import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,stat,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const pkg=JSON.parse(await readFile('package.json','utf8'));
const output=path.resolve('release/downloads');
await mkdir(output,{recursive:true});
async function run(exe,args,options={}){
 await new Promise((resolve,reject)=>{const child=spawn(exe,args,{stdio:'inherit',windowsHide:true,...options});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Build process exited ${code}`)));});
}
await writeFile('release/IFC Viewer/README.txt',`IFC Viewer ${pkg.version} — Windows x64\r\n\r\nExtract the entire IFC Viewer folder, then open IFC Viewer.exe. Keep all files together.\r\nNo installation, account or runtime internet required.\r\nGuide: https://github.com/Hajtrak/Tools/blob/main/IFC_Viewer/docs/USER_GUIDE.md\r\n`);
const zip=`IFC-Viewer-${pkg.version}-Windows-x64.zip`;
// A fresh temporary archive avoids retaining obsolete files from earlier builds.
const temp=path.join(output,`portable-${Date.now()}.zip`);
await run(require('7zip-bin').path7za,['a','-tzip','-mx=7',temp,'IFC Viewer'],{cwd:path.resolve('release')});
await rename(temp,path.join(output,zip));
const files=[zip];
if(!process.argv.includes('--portable-only')){
 await run(process.execPath,[require.resolve('electron-builder/cli.js'),'--prepackaged',path.resolve('release/IFC Viewer'),'--win','nsis','--x64','--publish','never'],{env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false',ELECTRON_BUILDER_CACHE:path.resolve('.cache/electron-builder')}});
 files.unshift(`IFC-Viewer-${pkg.version}-Setup.exe`);
}
let checksums='';
for(const name of files){const hash=createHash('sha256');for await(const chunk of createReadStream(path.join(output,name)))hash.update(chunk);checksums+=`${hash.digest('hex')}  ${name}\n`;console.log(`${name}: ${(await stat(path.join(output,name))).size} bytes`);}
await writeFile(path.join(output,'SHA256SUMS.txt'),checksums);
console.log('Release downloads:',output);
