import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..'), args = process.argv.slice(2);
const option = key => args.find(arg => arg.startsWith(`${key}=`))?.slice(key.length + 1);
const packageInfo = option('--exe') ? null : JSON.parse(await readFile(join(root, 'desktop/build/latest-package.json'), 'utf8'));
const executable = resolve(option('--exe') || packageInfo.executable);
const appDirectory = option('--app') ? resolve(option('--app')) : null;
const output = resolve(option('--output') || join(root, 'desktop/qa', `packaged-${Date.now()}`));
const port = Number(option('--port') || 9341);
await mkdir(output, { recursive: true });
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [...(appDirectory ? [appDirectory] : []), '--desktop-test',
  `--remote-debugging-port=${port}`, `--desktop-test-dir=${output}`,
  ...(args.includes('--hardware') ? [] : ['--desktop-software-rendering'])],
{ windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: environment });
const processLogs = []; child.stdout.on('data', value => processLogs.push(value.toString()));
child.stderr.on('data', value => processLogs.push(value.toString()));
let socket, sequence = 0;
const pending = new Map(), events = [], errors = [];
let failure;
const report = { executable, packagedExe: !appDirectory, offlineReload: false, screenshots: [], assertions: [], status: 'running' };
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolveCall, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 120000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolveCall(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + JSON.stringify(result.exceptionDetails.exception));
  return result.result.value;
}
async function waitForModel() {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const state = await evaluate(`({canvas:document.querySelectorAll('canvas').length,status:document.querySelector('[role="status"]')?.textContent||'',title:document.title})`);
    if (state.canvas > 0 && !state.status) { await delay(1200); return state; }
    if (state.status.includes('失败')) throw new Error(state.status);
    await delay(1000);
  }
  throw new Error('Desktop model did not finish loading');
}
async function screenshot(name) {
  // Wait for the changed React state and Three.js scene to reach the compositor.
  // A fixed short timeout can capture the preceding frame on software rendering.
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))`);
  // Request one hidden-window capture to flush a Windows compositor surface,
  // then retain the following frame rather than an earlier cached surface.
  await evaluate(`fetch('propulsion://app/__desktop-test__/capture.png').then(r=>r.arrayBuffer()).then(()=>true)`);
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))`);
  const data = await evaluate(`(async()=>{const response=await fetch('propulsion://app/__desktop-test__/capture.png');
    if(!response.ok)throw Error('Desktop test capture unavailable');const bytes=new Uint8Array(await response.arrayBuffer());
    let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value)})()`);
  const file = join(output, name); await writeFile(file, Buffer.from(data, 'base64'));
  report.screenshots.push(file);
}
try {
  let page;
  const startDeadline = Date.now() + 60000;
  while (Date.now() < startDeadline) {
    try { const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = pages.find(item => item.type === 'page'); if (page) break; } catch {}
    if (child.exitCode !== null) throw new Error(`Desktop process exited ${child.exitCode}`);
    await delay(500);
  }
  assert.ok(page, 'Desktop CDP target was not created');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data);
    if (value.id) { const call = pending.get(value.id); if (call) { pending.delete(value.id); value.error ? call.reject(new Error(JSON.stringify(value.error))) : call.resolve(value.result); } }
    else { events.push(value); if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails); }
  });
  socket.addEventListener('close', () => {
    for (const call of pending.values()) call.reject(new Error('Desktop debug connection closed'));
    pending.clear();
  });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.setWebLifecycleState', { state: 'active' });
  report.initial = await waitForModel();
  report.assertions.push('Local model loaded in the bundled executable');
  console.log('Desktop loaded; checking offline reload.');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Network.overrideNetworkState', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none' });
  const previousLoads = events.filter(event => event.method === 'Page.loadEventFired').length;
  await send('Page.reload', { ignoreCache: true });
  const reloadDeadline = Date.now() + 45000;
  while (events.filter(event => event.method === 'Page.loadEventFired').length <= previousLoads) {
    if (Date.now() > reloadDeadline) throw new Error('Offline page reload did not complete');
    await delay(250);
  }
  report.offlineState = await waitForModel();
  const environment = await evaluate(`({origin:location.origin,online:navigator.onLine,nodeExposed:typeof require!=='undefined'||typeof process!=='undefined'})`);
  assert.equal(environment.origin, 'propulsion://app'); assert.equal(environment.online, false); assert.equal(environment.nodeExposed, false);
  report.environment = environment; report.offlineReload = true;
  report.assertions.push('Reload succeeds with Chromium network emulation offline; renderer has no Node access');
  report.modelSha256 = await evaluate(`(async()=>{const b=await(await fetch('propulsion://app/model.glb')).arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('')})()`);
  const manifest = JSON.parse(await readFile(join(appDirectory || dirname(executable), 'release-manifest.json'), 'utf8'));
  assert.equal(report.modelSha256, manifest.modelSha256); report.assertions.push('Offline GLB bytes match the release SHA256');
  await screenshot('desktop-offline.png');
  const heading = await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='压气机通道');if(b)b.click();return Boolean(b)})()`);
  assert.equal(heading, true, 'Compressor passage button must be present');
  await delay(800);
  assert.equal(await evaluate(`document.querySelector('.viewer-caption')?.textContent.trim()`), '离心式压气机');
  const rotorButton = await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='叶轮与静叶');if(b)b.click();return Boolean(b)})()`);
  assert.equal(rotorButton, true, 'Rotor/stator view button must be present');
  await delay(1000);
  assert.equal(await evaluate(`document.querySelector('.viewer-mode')?.textContent.trim()`), '叶轮与静叶');
  await screenshot('desktop-compressor-rotors.png');
  report.assertions.push('Compressor passage and rotor/stator views switch successfully');
  assert.equal(await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='流道剖面');if(b)b.click();return Boolean(b)})()`), true);
  await delay(500);
  const slider = await evaluate(`(()=>{const s=document.querySelector('input[type=range]');if(!s)return false;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(s,'75');s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  assert.equal(slider, true, 'Section slider must be present');
  await delay(500);
  report.sectionOutput = await evaluate(`document.querySelector('output[for="section-depth"]')?.textContent.trim()`);
  assert.equal(report.sectionOutput, '75%');
  report.assertions.push('Section slider updates the displayed state to 75% offline');
  const switchBefore = await evaluate(`(()=>{const b=document.querySelector('[role="switch"]');if(!b)throw Error('No layer switch');const before=b.getAttribute('aria-checked');b.click();return before})()`);
  await delay(250);
  const switchAfter = await evaluate(`document.querySelector('[role="switch"]').getAttribute('aria-checked')`);
  assert.notEqual(switchAfter, switchBefore);
  await evaluate(`document.querySelector('[role="switch"]').click()`); await delay(250);
  assert.equal(await evaluate(`document.querySelector('[role="switch"]').getAttribute('aria-checked')`), switchBefore);
  report.assertions.push('Layer visibility switch changes and restores its aria-checked state');
  report.remoteRequests = events.filter(event => event.method === 'Network.requestWillBeSent' && /^https?:\/\//.test(event.params.request.url))
    .map(event => event.params.request.url);
  assert.equal(report.remoteRequests.length, 0); assert.equal(errors.length, 0);
  report.assertions.push('No external HTTP(S) resource requests or renderer exceptions');
  const diagnostics = JSON.parse(await readFile(join(output, 'desktop-diagnostics.json'), 'utf8'));
  assert.equal(diagnostics.webPreferences.nodeIntegration, false);
  assert.equal(diagnostics.webPreferences.contextIsolation, true);
  assert.equal(diagnostics.webPreferences.sandbox, true);
  assert.equal(diagnostics.rendererErrors.length, 0); assert.equal(diagnostics.loadFailures.length, 0);
  report.assertions.push('Node integration disabled; context isolation and sandbox enabled; no load or console errors');
  report.status = 'passed';
} catch (error) { failure = error; report.status = 'failed'; report.error = error.stack || String(error); }
finally {
  await writeFile(join(output, 'desktop-qa-report.json'), JSON.stringify({ ...report, errors }, null, 2));
  await writeFile(join(output, 'desktop-process.log'), processLogs.join(''));
  try { if (socket?.readyState === WebSocket.OPEN) await send('Browser.close'); } catch {}
  if (socket) socket.close();
  await delay(500);
  if (child.exitCode === null) child.kill();
}
console.log(JSON.stringify({ status: report.status, output, modelSha256: report.modelSha256, error: report.error }, null, 2));
if (failure) throw failure;
