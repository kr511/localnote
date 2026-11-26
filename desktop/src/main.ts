import path from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { startServer } from '../../server/src/server';

// One window, one server, one database: a second launch just focuses the first.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win: BrowserWindow | null = null;
let stop: (() => void) | null = null;

async function createWindow() {
  // %APPDATA%\LocalNote\localnote.db on Windows; survives updates and reinstalls.
  const dbFile = process.env.LOCALNOTE_DB ?? path.join(app.getPath('userData'), 'localnote.db');
  const server = await startServer({ dbFile, port: 0, clientDir: path.join(__dirname, 'client') });
  stop = server.close;
  const origin = `http://127.0.0.1:${server.port}`;

  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'LocalNote',
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  win.webContents.session.setSpellCheckerLanguages(['de-DE']);

  // Links to other sites open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => (win = null));
  await win.loadURL(origin);
  console.log(`LocalNote läuft auf ${origin} (DB: ${dbFile})`);
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() =>
  createWindow().catch((err) => {
    dialog.showErrorBox('LocalNote konnte nicht starten', String(err?.stack ?? err));
    app.quit();
  }),
);

app.on('window-all-closed', () => {
  stop?.();
  app.quit();
});
