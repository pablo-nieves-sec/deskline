const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const SHORTCUT = 'CommandOrControl+Shift+A';
const KINDS = ['vulns', 'tasks', 'followups'];
const QUICK_W = 460;

let data = emptyData();
let mainWin = null;
let quickWin = null;
let tray = null;
let quitting = false;
let lastBlurHide = 0;

function emptyData() {
  return { version: 1, companies: [], vulns: [], tasks: [], followups: [] };
}
function dataFile() {
  return path.join(app.getPath('userData'), 'deskline-data.json');
}
function normalize(d) {
  const base = emptyData();
  if (!d || typeof d !== 'object') return base;
  for (const k of ['companies', ...KINDS]) base[k] = Array.isArray(d[k]) ? d[k] : [];
  return base;
}
function loadData() {
  try {
    data = normalize(JSON.parse(fs.readFileSync(dataFile(), 'utf8')));
  } catch (_) {
    data = emptyData();
  }
}
function saveData() {
  const file = dataFile();
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function broadcast(except) {
  for (const w of [mainWin, quickWin]) {
    if (w && !w.isDestroyed() && (!except || w.webContents !== except)) {
      w.webContents.send('data:changed', data);
    }
  }
}

function webPrefs() {
  return {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  };
}

function createMain() {
  const opts = {
    width: 1360, height: 900, minWidth: 980, minHeight: 640,
    backgroundColor: '#050506', show: false, title: 'Deskline',
    webPreferences: webPrefs()
  };
  if (process.platform === 'darwin') {
    opts.titleBarStyle = 'hiddenInset';
    opts.trafficLightPosition = { x: 18, y: 18 };
  } else if (process.platform === 'win32') {
    opts.titleBarStyle = 'hidden';
    opts.titleBarOverlay = { color: '#050506', symbolColor: '#9b9ba3', height: 64 };
  }
  mainWin = new BrowserWindow(opts);
  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWin.once('ready-to-show', () => mainWin.show());
  mainWin.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWin.hide();
    }
  });
}

function createQuick() {
  const opts = {
    width: QUICK_W, height: 250, frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false, hasShadow: false, fullscreenable: false,
    minimizable: false, maximizable: false, webPreferences: webPrefs()
  };
  if (process.platform === 'darwin') opts.type = 'panel';
  quickWin = new BrowserWindow(opts);
  if (process.platform === 'darwin') {
    quickWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    quickWin.setAlwaysOnTop(true, 'floating');
  }
  quickWin.loadFile(path.join(__dirname, 'src', 'quick.html'));
  quickWin.on('blur', () => {
    if (!quickWin.webContents.isDevToolsOpened() && quickWin.isVisible()) {
      lastBlurHide = Date.now();
      quickWin.hide();
    }
  });
}

function showMain() {
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

function showQuick(anchorToTray) {
  if (!quickWin) return;
  const [w, h] = quickWin.getSize();
  const bounds = tray && anchorToTray ? tray.getBounds() : null;
  const point = bounds && bounds.width ? { x: bounds.x, y: bounds.y } : screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(point).workArea;
  let x, y;
  if (bounds && bounds.width) {
    x = Math.round(bounds.x + bounds.width / 2 - w / 2);
    y = bounds.y > wa.y + wa.height / 2 ? bounds.y - h - 6 : bounds.y + bounds.height + 6;
  } else {
    x = Math.round(wa.x + wa.width / 2 - w / 2);
    y = Math.round(wa.y + wa.height * 0.2);
  }
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w));
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - h));
  quickWin.setPosition(x, y, false);
  quickWin.show();
  quickWin.focus();
  quickWin.webContents.send('quick:show');
}

function toggleQuick(anchorToTray) {
  if (quickWin && quickWin.isVisible()) quickWin.hide();
  else if (Date.now() - lastBlurHide < 300) return;
  else showQuick(anchorToTray);
}

function createTray() {
  const dir = path.join(__dirname, 'assets');
  let img;
  if (process.platform === 'darwin') {
    img = nativeImage.createFromPath(path.join(dir, 'trayTemplate.png'));
    img.setTemplateImage(true);
  } else {
    img = nativeImage.createFromPath(path.join(dir, 'tray.png'));
  }
  tray = new Tray(img);
  tray.setToolTip('Deskline');
  const menu = Menu.buildFromTemplate([
    { label: 'Quick add (' + (process.platform === 'darwin' ? 'Cmd' : 'Ctrl') + '+Shift+A)', click: () => showQuick(true) },
    { label: 'Open Deskline', click: showMain },
    { type: 'separator' },
    { label: 'Quit Deskline', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.on('click', () => toggleQuick(true));
  tray.on('right-click', () => tray.popUpContextMenu(menu));
  if (process.platform === 'linux') tray.setContextMenu(menu);
}

function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Deskline',
      submenu: [
        { role: 'about' }, { type: 'separator' },
        { label: 'Quick add', accelerator: SHORTCUT, click: () => showQuick(false) },
        { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' },
        { label: 'Quit Deskline', accelerator: 'Cmd+Q', click: () => { quitting = true; app.quit(); } }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]));
}

ipcMain.handle('data:load', () => data);
ipcMain.handle('data:save', (e, next) => {
  data = normalize(next);
  saveData();
  broadcast(e.sender);
  return true;
});
ipcMain.handle('data:add', (e, type, item) => {
  if (!KINDS.includes(type) || !item || typeof item !== 'object') return false;
  data[type].push(item);
  saveData();
  broadcast();
  return true;
});
ipcMain.handle('data:export', async () => {
  const stamp = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(mainWin, {
    title: 'Export backup',
    defaultPath: `deskline-backup-${stamp}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2));
  return true;
});
ipcMain.handle('data:import', async () => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Import backup',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try {
    const next = normalize(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')));
    const ok = await dialog.showMessageBox(mainWin, {
      type: 'warning', buttons: ['Replace my data', 'Cancel'], defaultId: 1, cancelId: 1,
      message: 'Replace current data with this backup?',
      detail: 'This overwrites everything in Deskline. Export a backup first if you are unsure.'
    });
    if (ok.response !== 0) return null;
    data = next;
    saveData();
    broadcast();
    return data;
  } catch (err) {
    dialog.showErrorBox('Import failed', 'That file is not a valid Deskline backup.');
    return null;
  }
});
ipcMain.handle('quick:hide', () => { if (quickWin) quickWin.hide(); });
ipcMain.handle('quick:resize', (e, height) => {
  if (!quickWin) return;
  const h = Math.max(200, Math.min(Number(height) || 250, 900));
  quickWin.setResizable(true);
  quickWin.setSize(QUICK_W, Math.round(h));
  quickWin.setResizable(false);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showMain);
  if (process.platform === 'win32') app.setAppUserModelId('com.deskline.app');
  app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) {
      try { app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))); } catch (_) {}
    }
    loadData();
    buildMenu();
    createMain();
    createQuick();
    createTray();
    globalShortcut.register(SHORTCUT, () => toggleQuick(false));
    app.on('activate', showMain);
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => {});
}
