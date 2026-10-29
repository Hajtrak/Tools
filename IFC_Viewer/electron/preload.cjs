const { contextBridge, ipcRenderer, webUtils } = require('electron');
const api = {
  saveIfc: (bytes, name) => ipcRenderer.invoke('ifc:save-copy', bytes, name),
  saveExport: (format, text, name) => ipcRenderer.invoke('ifc:export', format, text, name),
  openFile: () => ipcRenderer.invoke('ifc:open'),
  droppedFile: file => ipcRenderer.invoke('ifc:drop', webUtils.getPathForFile(file)),
};
if (process.argv.includes('--viewer-test')) api.testRead = path => ipcRenderer.invoke('ifc:test-read', path);
contextBridge.exposeInMainWorld('desktop', api);
