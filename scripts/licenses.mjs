import { readFile, readdir, realpath, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

export async function collectRuntimeLicenses(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const queue = Object.keys(manifest.dependencies).map(name => ({ name, from: path.join(root, 'package.json') }));
  const seen = new Set(), notices = [];
  while (queue.length) {
    const { name, from } = queue.shift();
    const require = createRequire(from);
    let pkg;
    try { pkg = require.resolve(name + '/package.json'); }
    catch {
      let dir = path.dirname(require.resolve(name));
      while (true) {
        const candidate = path.join(dir, 'package.json');
        try { if (JSON.parse(await readFile(candidate, 'utf8')).name === name) { pkg = candidate; break; } }
        catch { /* Continue to the owning package directory. */ }
        const parent = path.dirname(dir);
        if (parent === dir) throw new Error('Cannot find package license: ' + name);
        dir = parent;
      }
    }
    pkg = await realpath(pkg);
    if (seen.has(pkg)) continue;
    seen.add(pkg);
    const info = JSON.parse(await readFile(pkg, 'utf8'));
    const files = (await readdir(path.dirname(pkg))).filter(file => /^(licen[cs]e|copying|notice)(\.|$)/i.test(file));
    if (!files.length) throw new Error('No license notice found for ' + info.name);
    const targetName = info.name.replaceAll('/', '__') + '-' + info.version;
    const target = path.join(root, 'public/licenses', targetName);
    await mkdir(target, { recursive: true });
    for (const file of files) await copyFile(path.join(path.dirname(pkg), file), path.join(target, file));
    notices.push({ name: info.name, version: info.version, license: info.license, files: files.map(file => targetName + '/' + file) });
    for (const dependency of Object.keys(info.dependencies ?? {})) queue.push({ name: dependency, from: pkg });
  }
  notices.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  await writeFile(path.join(root, 'public/licenses/index.json'), JSON.stringify(notices, null, 2) + '\n');
  console.log('Included license notices for ' + notices.length + ' runtime packages.');
  return notices;
}
