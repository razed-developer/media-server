import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const cargoRelease = resolve(root, 'src-tauri', 'target', 'release');
const webSource = resolve(root, 'src-tauri', 'web');
const releaseRoot = resolve(root, 'release');

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

if (process.platform !== 'win32') {
  throw new Error('The Windows portable build must be created on Windows.');
}

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const architecture = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : process.arch;
const artifactName = `Onyx-${version}-windows-${architecture}-portable`;
const outputDir = resolve(releaseRoot, artifactName);
const archivePath = resolve(releaseRoot, `${artifactName}.zip`);
const executableSource = resolve(cargoRelease, 'media-server.exe');
const executableTarget = resolve(outputDir, 'Onyx.exe');

await run('npx.cmd', ['tauri', 'build', '--no-bundle']);

await rm(outputDir, { recursive: true, force: true });
await rm(archivePath, { force: true });
await mkdir(outputDir, { recursive: true });
await cp(executableSource, executableTarget);
await cp(webSource, resolve(outputDir, 'web'), { recursive: true });
await writeFile(resolve(outputDir, 'onyx-portable.flag'), '');
await mkdir(resolve(outputDir, 'OnyxData'), { recursive: true });
await writeFile(
  resolve(outputDir, 'README.txt'),
  [
    'Onyx Portable',
    '',
    'Run Onyx.exe directly. No installation is required.',
    'Settings, the library database, artwork, and provider state are stored in OnyxData.',
    'Keep onyx-portable.flag beside Onyx.exe to preserve portable mode.',
    '',
    'Microsoft Edge WebView2 and FFmpeg/FFprobe are required on the computer.',
    ''
  ].join('\r\n')
);

await mkdir(dirname(archivePath), { recursive: true });
await run('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  'Compress-Archive -Path $args[0] -DestinationPath $args[1] -Force',
  resolve(outputDir, '*'),
  archivePath
]);

console.log(`\nPortable folder: ${outputDir}`);
console.log(`Portable ZIP:    ${archivePath}`);
