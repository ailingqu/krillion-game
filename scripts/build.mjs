import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { collectRuntimeLicenses } from './licenses.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const script of ['prepare-krillion.mjs']) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
    cwd: root, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
for (const [from, to] of [['web/index.html', 'index.html'], ['LICENSE', 'LICENSE.txt'], ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md']]) {
  await copyFile(new URL('../' + from, import.meta.url), new URL('../public/' + to, import.meta.url));
}
const packages = await collectRuntimeLicenses(root);
const licenseTexts = await Promise.all(packages.flatMap(pkg => pkg.files).map(file =>
  readFile(new URL('../public/licenses/' + file, import.meta.url), 'utf8')));
const notice = [
  'Krillion — Cubes 2048 — https://cubes-2048.io',
  await readFile(new URL('../LICENSE', import.meta.url), 'utf8'),
  'Runtime packages: ' + packages.map(pkg => pkg.name + '@' + pkg.version).join(', '),
  ...new Set(licenseTexts),
  await readFile(new URL('../lib/games/krillion/assets/FONT-LICENSE.txt', import.meta.url), 'utf8'),
].join('\n\n');
await writeFile(new URL('../public/licenses/ALL-NOTICES.txt', import.meta.url), notice);
// Keep attribution inside portable files too; copying a single HTML must not
// lose bundled libraries' notices or any included font notice. This data block is not executable.
for (const file of ['public/games/krillion/index.html', '.game-previews/krillion-preview.html']) {
  const target = new URL('../' + file, import.meta.url);
  const html = await readFile(target, 'utf8');
  await writeFile(target, html.replace('</head>', () => '<script type="text/plain" id="license-notices">' + notice.replace(/<\/script/gi, '<\\/script') + '</script></head>'));
}
console.log('Built Krillion and launcher in public/.');
