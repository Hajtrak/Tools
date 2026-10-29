const { app, BrowserWindow, dialog, ipcMain, protocol, net, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
protocol.registerSchemesAsPrivileged([{ scheme: 'ifcviewer', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true } }]);
let win;
if (process.env.IFC_TEST_PROFILE) app.setPath('userData', process.env.IFC_TEST_PROFILE);
const testMode = process.argv.includes('--viewer-test');
function trusted(event) {
  if (event.sender !== win.webContents || !event.senderFrame?.url.startsWith('ifcviewer://app/')) throw new Error('Unsupported request');
}
async function readIfc(filePath) {
  if (typeof filePath !== 'string' || path.extname(filePath).toLowerCase() !== '.ifc') throw new Error('Choose a file with an .ifc extension.');
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error('This is not a file.');
  if (stat.size === 0) throw new Error('This IFC file is empty.');
  if (stat.size > 1024 * 1024 * 1024) throw new Error('This first version supports IFC files up to 1 GB.');
  const bytes = await fs.readFile(filePath);
  return { name: path.basename(filePath), size: bytes.byteLength, bytes: new Uint8Array(bytes) };
}
app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '../dist');
  protocol.handle('ifcviewer', async request => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Not found', { status: 404 });
    let name;
    try { name = decodeURIComponent(url.pathname); } catch { return new Response('Bad path', { status: 400 }); }
    const target = path.resolve(root, '.' + name);
    if (!target.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
    try {
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png' };
      return new Response(await fs.readFile(target), { headers: { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' } });
    }
    catch { return new Response('Not found', { status: 404 }); }
  });
  // No outbound network requests: assets, WASM and workers are packaged locally.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = /^(ifcviewer:|blob:|data:|devtools:)/.test(details.url);
    callback({ cancel: !allowed });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ipcMain.handle('ifc:open', async event => {
    trusted(event);
    const result = await dialog.showOpenDialog(win, { title: 'Open IFC model', filters: [{ name: 'IFC models', extensions: ['ifc'] }], properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return null;
    return readIfc(result.filePaths[0]);
  });
  ipcMain.handle('ifc:save-copy', async (event, bytes, name) => {
    trusted(event);
    if (!(bytes instanceof Uint8Array) || bytes.length > 1024 * 1024 * 1024 || typeof name !== 'string') throw new Error('Invalid IFC export.');
    const base = path.basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0,150);
    const result = await dialog.showSaveDialog(win, {title:'Save edited IFC as a new file', defaultPath:base, filters:[{name:'IFC model',extensions:['ifc']}]});
    if(result.canceled || !result.filePath) return null;
    const target = /\.ifc$/i.test(result.filePath) ? result.filePath : result.filePath + '.ifc';
    try { await fs.writeFile(target, bytes, {flag:'wx'}); }
    catch(error) { if(error.code==='EEXIST') throw new Error('Choose a new filename. Existing files are preserved.'); throw error; }
    return path.basename(target);
  });
  ipcMain.handle('ifc:export', async (event, format, text, name) => {
    trusted(event);
    if (!['csv','txt'].includes(format) || typeof text !== 'string' || text.length > 100000000 || typeof name !== 'string') throw new Error('Invalid export request.');
    const base = path.basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0,150) || 'Material list';
    const result = await dialog.showSaveDialog(win, { title: 'Export material list', defaultPath: base + '.' + format, filters: [{name: format.toUpperCase(), extensions:[format]}] });
    if(result.canceled || !result.filePath) return null;
    const target = path.extname(result.filePath).toLowerCase() === '.' + format ? result.filePath : result.filePath + '.' + format;
    if(path.extname(target).toLowerCase() === '.ifc') throw new Error('IFC source files cannot be overwritten.');
    await fs.writeFile(target, text, 'utf8');
    return path.basename(target);
  });
  ipcMain.handle('ifc:drop', async (event, filePath) => { trusted(event); return readIfc(filePath); });
  if (testMode) ipcMain.handle('ifc:test-read', async (event, filePath) => { trusted(event); return readIfc(filePath); });
  win = new BrowserWindow({ width: 1280, height: 850, minWidth: 800, minHeight: 580, title: 'IFC Viewer', backgroundColor: '#edf0f2', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, additionalArguments: testMode ? ['--viewer-test'] : [] }
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  await win.loadURL('ifcviewer://app/index.html');
});
app.on('window-all-closed', () => app.quit());
