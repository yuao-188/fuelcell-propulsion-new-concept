'use strict';

const { app, BrowserWindow, Menu, protocol, session, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const APP_URL = 'propulsion://app/index.html';
const TITLE = '氢能燃料电池发动机 · 离线桌面版';
const args = process.argv.slice(1);
const testing = args.includes('--desktop-test');
const valueOf = key => args.find(arg => arg.startsWith(`${key}=`))?.slice(key.length + 1);
const testDirectory = testing && valueOf('--desktop-test-dir') ? path.resolve(valueOf('--desktop-test-dir')) : null;
const diagnostics = { localUrl: APP_URL, electron: process.versions.electron, chromium: process.versions.chrome,
  startedAt: new Date().toISOString(), localRequests: [], blockedRequests: [], rendererErrors: [], loadFailures: [] };
let mainWindow;

app.setName('氢能燃料电池发动机');
app.setAppUserModelId('cn.fuelcell.propulsion.desktop');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
if (!testing) {
  app.commandLine.removeSwitch('remote-debugging-port');
  app.commandLine.removeSwitch('remote-debugging-pipe');
} else {
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  if (args.includes('--desktop-software-rendering')) {
    app.commandLine.appendSwitch('use-angle', 'swiftshader');
    app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  }
}
protocol.registerSchemesAsPrivileged([{ scheme: 'propulsion', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }]);

const isApplicationUrl = raw => {
  try { const url = new URL(raw); return url.protocol === 'propulsion:' && url.hostname === 'app' && !url.port && !url.username && !url.password; }
  catch { return false; }
};
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
  + "font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function saveDiagnostics() {
  if (!testDirectory) return;
  fs.mkdirSync(testDirectory, { recursive: true });
  fs.writeFileSync(path.join(testDirectory, 'desktop-diagnostics.json'), JSON.stringify(diagnostics, null, 2));
}

function installLocalProtocol() {
  const webRoot = path.resolve(app.getAppPath(), 'web');
  const manifest = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'release-manifest.json'), 'utf8'));
  diagnostics.release = manifest;
  const allowed = new Set(manifest.files.map(file => file.path));
  protocol.handle('propulsion', request => {
    if (!isApplicationUrl(request.url) || !['GET', 'HEAD'].includes(request.method)) return new Response('Forbidden', { status: 403 });
    let relative;
    try {
      const url = new URL(request.url);
      relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
    } catch { return new Response('Bad request', { status: 400 }); }
    // Test-only, read-only capture of this application's own hidden window.
    // CDP's surface capture can stall on Windows when the native window is hidden.
    if (testing && relative === '__desktop-test__/capture.png' && request.method === 'GET' && mainWindow) {
      return mainWindow.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
        .then(capture => new Response(capture.toPNG(), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } }));
    }
    if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => part === '.' || part === '..')
      || !allowed.has(relative)) return new Response('Not found', { status: 404 });
    const target = path.resolve(webRoot, ...relative.split('/'));
    const remaining = path.relative(webRoot, target);
    if (remaining.startsWith('..') || path.isAbsolute(remaining)) return new Response('Forbidden', { status: 403 });
    try {
      const stat = fs.statSync(target);
      if (!stat.isFile()) return new Response('Not found', { status: 404 });
      diagnostics.localRequests.push({ path: relative, bytes: stat.size });
      const headers = { 'Content-Type': contentTypes[path.extname(target)] || 'application/octet-stream',
        'Content-Length': String(stat.size), 'Content-Security-Policy': csp,
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
      return new Response(request.method === 'HEAD' ? null : Readable.toWeb(fs.createReadStream(target)), { status: 200, headers });
    } catch { return new Response('Not found', { status: 404 }); }
  });
}

async function captureTestResult() {
  if (!testDirectory) return;
  try {
    const deadline = Date.now() + 180000;
    let state;
    while (Date.now() < deadline && mainWindow && !mainWindow.isDestroyed()) {
      state = await mainWindow.webContents.executeJavaScript(`({
        origin: location.origin, title: document.title,
        canvasCount: document.querySelectorAll('canvas').length,
        status: document.querySelector('[role="status"]')?.textContent || '',
        nodeExposed: typeof require !== 'undefined' || typeof process !== 'undefined'
      })`);
      if (state.canvasCount > 0 && !state.status) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    diagnostics.renderer = state;
    diagnostics.webPreferences = mainWindow.webContents.getLastWebPreferences();
    diagnostics.gpuFeatures = app.getGPUFeatureStatus();
    diagnostics.modelReady = Boolean(state?.canvasCount > 0 && !state?.status);
    await new Promise(resolve => setTimeout(resolve, 1200));
    fs.mkdirSync(testDirectory, { recursive: true });
    const capture = await mainWindow.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    fs.writeFileSync(path.join(testDirectory, 'desktop-overall.png'), capture.toPNG());
  } catch (error) { diagnostics.testError = String(error); }
  saveDiagnostics();
}

app.whenReady().then(async () => {
  installLocalProtocol();
  const currentSession = session.defaultSession;
  currentSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  currentSession.setPermissionCheckHandler(() => false);
  currentSession.setDevicePermissionHandler(() => false);
  currentSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const allowed = isApplicationUrl(details.url) || details.url.startsWith('data:') || details.url.startsWith('blob:propulsion://app/');
    if (!allowed) diagnostics.blockedRequests.push({ url: details.url, resourceType: details.resourceType });
    callback({ cancel: !allowed });
  });
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({ width: 1280, height: 900, minWidth: 900, minHeight: 650,
    title: TITLE, backgroundColor: '#eef2f4', show: false, autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'app.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, spellcheck: false,
      devTools: testing, backgroundThrottling: !testing },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (url !== APP_URL) event.preventDefault(); });
  mainWindow.webContents.on('will-redirect', (event, url) => { if (url !== APP_URL) event.preventDefault(); });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.on('page-title-updated', event => { event.preventDefault(); mainWindow.setTitle(TITLE); });
  mainWindow.webContents.on('console-message', details => {
    if (details.level === 'error') diagnostics.rendererErrors.push({ message: details.message, source: details.sourceId, line: details.lineNumber });
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    diagnostics.loadFailures.push({ code, description, url }); saveDiagnostics();
  });
  mainWindow.on('ready-to-show', () => { if (!testing || args.includes('--desktop-show')) mainWindow.show(); });
  mainWindow.on('closed', () => { saveDiagnostics(); mainWindow = null; });
  await mainWindow.loadURL(APP_URL);
  if (testing) void captureTestResult();
}).catch(error => {
  diagnostics.startupError = String(error); saveDiagnostics();
  dialog.showErrorBox('桌面模型无法打开', `请完整解压压缩包后再运行，不要只复制 EXE。\n\n${error.message}`);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
