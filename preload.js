const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deskline', {
  platform: process.platform,
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  add: (type, item) => ipcRenderer.invoke('data:add', type, item),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  hideQuick: () => ipcRenderer.invoke('quick:hide'),
  resizeQuick: (height) => ipcRenderer.invoke('quick:resize', height),
  onChanged: (cb) => ipcRenderer.on('data:changed', (_e, data) => cb(data)),
  onQuickShow: (cb) => ipcRenderer.on('quick:show', () => cb())
});
