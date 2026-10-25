import { cp, copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..'), desktop = join(root, 'desktop');
const args = process.argv.slice(2), option = key => args.find(arg => arg.startsWith(`${key}=`))?.slice(key.length + 1);
const outputRoot = resolve(option('--output-root') || join(root, '..', '桌面版发布'));
const requireDesktop = createRequire(join(desktop, 'package.json'));
const title = '氢能燃料电池发动机', executableName = `${title}.exe`;
const hash = data => createHash('sha256').update(data).digest('hex');
const within = (parent, child) => { const rest = relative(parent, child); return rest && !rest.startsWith('..') && !isAbsolute(rest); };
const quotePowerShell = value => `'${value.replaceAll("'", "''")}'`;
async function run(file, argv) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(file, argv, { windowsHide: true, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${file} exited ${code}`)));
  });
}
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
async function filesIn(directory, prefix = '') {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error(`Symlinks are not accepted in the desktop payload: ${item.name}`);
    const name = prefix + item.name;
    if (item.isDirectory()) result.push(...await filesIn(join(directory, item.name), `${name}/`));
    else if (item.isFile()) result.push(name);
  }
  return result.sort();
}
async function zipBundle(bundle) {
  if (!within(outputRoot, bundle) || !await exists(join(bundle, executableName))) throw new Error('ZIP source is not a desktop bundle inside the release directory');
  const manifest = JSON.parse(await readFile(join(bundle, 'release-manifest.json'), 'utf8'));
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(manifest.packagedAt)).replaceAll('-', '');
  const delivery = `${bundle}-交付`;
  await mkdir(delivery, { recursive: false });
  const zip = join(delivery, `${title}-Windows免安装版-${date}.zip`);
  if (await exists(zip)) throw new Error(`Refusing to replace an existing ZIP: ${zip}`);
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Compress-Archive -LiteralPath ${quotePowerShell(bundle)} -DestinationPath ${quotePowerShell(zip)} -CompressionLevel Optimal`]);
  const bytes = await readFile(zip), checksum = hash(bytes);
  await writeFile(`${zip}.sha256`, `${checksum}  ${basename(zip)}\n`);
  console.log(JSON.stringify({ zip, bytes: bytes.length, sha256: checksum }, null, 2));
  return zip;
}
if (option('--zip-only')) {
  await zipBundle(resolve(option('--zip-only')));
  process.exit(0);
}
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This portable package is built on Windows x64');
const runtime = dirname(requireDesktop('electron'));
const runtimeVersion = (await readFile(join(runtime, 'version'), 'utf8')).trim().replace(/^v/, '');
const desktopPackage = JSON.parse(await readFile(join(desktop, 'package.json'), 'utf8'));
if (runtimeVersion !== desktopPackage.devDependencies.electron) throw new Error('Installed Electron does not match the locked desktop version');
const runtimeChecksums = JSON.parse(await readFile(join(desktop, 'node_modules/electron/checksums.json'), 'utf8'));
const source = resolve(option('--source') || join(root, 'dist-new-design'));
const indexPath = await exists(join(source, 'index.source.html')) ? join(source, 'index.source.html') : join(source, 'index.html');
const html = await readFile(indexPath, 'utf8'), model = await readFile(join(source, 'model.glb'));
if (model.readUInt32LE(0) !== 0x46546c67) throw new Error('Desktop payload is not a GLB model');
if (/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(html)) throw new Error('Desktop HTML references a remote runtime resource');
const modelHash = hash(model), frontendHash = hash(Buffer.from(html));
const buildLabel = `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '')}-${modelHash.slice(0, 8)}-${Date.now().toString(36)}`;
const staging = join(desktop, 'build', buildLabel, 'app'), web = join(staging, 'web');
await mkdir(web, { recursive: true });
await writeFile(join(web, 'index.html'), html);
await writeFile(join(web, 'model.glb'), model);
await cp(join(source, 'assets'), join(web, 'assets'), { recursive: true, errorOnExist: true });
await copyFile(join(desktop, 'main.cjs'), join(staging, 'main.cjs'));
await writeFile(join(staging, 'package.json'), JSON.stringify({ name: desktopPackage.name, version: desktopPackage.version,
  description: desktopPackage.description, main: 'main.cjs', private: true }, null, 2));

// A native ICO assembled from vector primitives; no network or icon-font runtime.
function createIcon() {
  const size = 256, pixels = Buffer.alloc(size * size * 4), mask = Buffer.alloc(size * size / 8);
  const circle = (x, y, a, b, r) => (x - a) ** 2 + (y - b) ** 2 <= r * r;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = ((size - y - 1) * size + x) * 4;
    const cx = Math.max(50, Math.min(206, x)), cy = Math.max(50, Math.min(206, y));
    const inside = x >= 14 && x <= 242 && y >= 14 && y <= 242 && circle(x, y, cx, cy, 36);
    let color = [18, 57, 70];
    if (inside) {
      const radial = Math.hypot(x - 85, y - 128), angle = Math.atan2(y - 128, x - 85);
      const blade = ((angle + Math.PI * 4 + radial * .011) % (Math.PI * 2 / 3));
      if ((radial >= 15 && radial <= 62 && blade < .75) || radial < 17) color = [211, 230, 236];
      if (radial > 65 && radial < 69) color = [69, 143, 169];
      if (x >= 165 && x <= 213 && [81, 117, 153].some(a => y >= a && y <= a + 22)) color = [230, 181, 72];
      if (x >= 175 && x <= 203 && [85, 121, 157].some(a => y >= a && y <= a + 2)) color = [255, 221, 138];
      pixels.set([color[2], color[1], color[0], 255], index);
    } else mask[(size - y - 1) * (size / 8) + (x >> 3)] |= 1 << (7 - (x & 7));
  }
  const dib = Buffer.alloc(40); dib.writeUInt32LE(40, 0); dib.writeInt32LE(size, 4); dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14); dib.writeUInt32LE(pixels.length, 20);
  const image = Buffer.concat([dib, pixels, mask]), header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(image.length, 14); header.writeUInt32LE(22, 18);
  return Buffer.concat([header, image]);
}
await writeFile(join(staging, 'app.ico'), createIcon());
const files = [];
for (const file of await filesIn(web)) { const data = await readFile(join(web, ...file.split('/'))); files.push({ path: file, bytes: data.length, sha256: hash(data) }); }
const manifest = { application: title, version: desktopPackage.version, platform: 'win32-x64', electron: runtimeVersion,
  electronRuntimeArchiveSha256: runtimeChecksums[`electron-v${runtimeVersion}-win32-x64.zip`],
  packagedAt: new Date().toISOString(), modelSha256: modelHash, frontendSha256: frontendHash,
  runtimeOrigin: 'propulsion://app', requiresNetwork: false, requiresNodeInstallation: false, files };
await writeFile(join(staging, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
if (args.includes('--prepare-only')) {
  console.log(JSON.stringify({ staging, electron: join(runtime, 'electron.exe'), modelSha256: modelHash }, null, 2));
  process.exit(0);
}

await mkdir(outputRoot, { recursive: true });
const bundle = join(outputRoot, `${title}-Windows-x64-${buildLabel}`);
if (await exists(bundle)) throw new Error(`Refusing to replace an existing release: ${bundle}`);
await cp(runtime, bundle, { recursive: true, filter: path => basename(path) !== 'default_app.asar' });
await rename(join(bundle, 'electron.exe'), join(bundle, executableName));
if (await exists(join(bundle, 'electron_wer.dll'))) await rename(join(bundle, 'electron_wer.dll'), join(bundle, `${title}_wer.dll`));
const asar = await import(pathToFileURL(requireDesktop.resolve('@electron/asar')).href);
await asar.createPackage(staging, join(bundle, 'resources', 'app.asar'));
const { rcedit } = await import(pathToFileURL(requireDesktop.resolve('rcedit')).href);
await rcedit(join(bundle, executableName), { icon: join(staging, 'app.ico'), 'file-version': desktopPackage.version,
  'product-version': desktopPackage.version, 'requested-execution-level': 'asInvoker',
  'version-string': { ProductName: title, FileDescription: `${title} · 离线结构模型`, OriginalFilename: executableName } });
await writeFile(join(bundle, '使用说明.txt'), '\ufeff' + `${title} · 离线桌面版\r\n\r\n1. 完整解压文件夹。\r\n2. 双击“${executableName}”。\r\n3. 保留同目录的 DLL、locales 和 resources，不要只发送 EXE。\r\n\r\n支持 Windows 10/11 64位，无需安装 Node.js、浏览器或其他运行库，无需联网。\r\n可旋转缩放、连续剖切、切换观察视角以及显示/隐藏各部件。\r\n当前模型 SHA256：${modelHash}\r\n`);
await writeFile(join(bundle, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
let notices = 'Bundled frontend open-source notices\n\n';
for (const name of ['react', 'react-dom', 'three', 'lucide-react', 'scheduler']) {
  const candidates = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map(file => join(root, 'node_modules', name, file));
  for (const candidate of candidates) if (await exists(candidate)) { notices += `===== ${name} =====\n${await readFile(candidate, 'utf8')}\n\n`; break; }
}
await writeFile(join(bundle, 'THIRD_PARTY_NOTICES.txt'), notices);
await mkdir(join(desktop, 'build'), { recursive: true });
await writeFile(join(desktop, 'build', 'latest-package.json'), JSON.stringify({ bundle, executable: join(bundle, executableName), staging, manifest }, null, 2));
console.log(JSON.stringify({ bundle, executable: join(bundle, executableName), modelSha256: modelHash,
  electron: runtimeVersion, files: (await filesIn(bundle)).length }, null, 2));
if (!args.includes('--no-zip')) await zipBundle(bundle);
