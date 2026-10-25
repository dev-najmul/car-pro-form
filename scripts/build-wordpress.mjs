import { cp, mkdir, readdir, readFile, writeFile, rm, lstat, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'wordpress/tuxano-booking');
const pluginHeader = await readFile(join(source, 'tuxano-booking.php'), 'utf8');
const version = pluginHeader.match(/\* Version:\s*(\d+\.\d+\.\d+)/)?.[1];
if (!version) throw new Error('A semantic plugin version is required.');
const output = join(root, 'build/tuxano-booking');
const marker = '.tuxano-booking-build';
await mkdir(output, { recursive: true });
if ((await lstat(output)).isSymbolicLink()) throw new Error('Plugin build must not be a symbolic link.');
const existing = await readdir(output);
if (existing.length && !existing.includes(marker)) throw new Error('Refusing to replace an unowned build directory.');
// Keep the root inode: the local WordPress test container bind-mounts this path.
for (const file of existing) await rm(join(output, file), { recursive: true, force: true });
await writeFile(join(output, marker), 'Tuxano Booking build\n');
await cp(source, output, { recursive: true, dereference: false });
const publicDirectory = join(output, 'public', version);
await mkdir(publicDirectory, { recursive: true });
for (const file of ['app.js', 'maps.js', 'pricing.js', 'pickup-map.js', 'countries.js', 'styles.css', 'quick-booking.js', 'quick-handoff.js', 'quick-booking.css']) {
  await cp(join(root, file), join(publicDirectory, file));
}
await cp(join(root, 'assets'), join(publicDirectory, 'assets'), { recursive: true, dereference: false });
// Scan the complete release tree, including generated files, before packaging.
let count = 0;
async function scan(path) {
  await chmod(path, 0o755);
  for (const item of await readdir(path, { withFileTypes: true })) {
    const file = join(path, item.name);
    if (item.isSymbolicLink()) throw new Error('Release assets cannot contain symbolic links.');
    if (item.isDirectory()) { await scan(file); continue; }
    if (/^\.env|maps-config\.json|\.log$|\.sql$|storage-state|credential/i.test(item.name)) throw new Error('A private file entered the plugin release.');
    const bytes = await readFile(file);
    if (/AIza[\w-]{35}/.test(bytes.toString('latin1'))) throw new Error('A Google credential entered the plugin release.');
    await chmod(file, 0o644);
    count++;
  }
}
await scan(output);
await mkdir(join(root, 'releases'), { recursive: true });
const filename = `tuxano-booking-${version}.zip`;
const zip = resolve(root, 'releases', filename);
const packaged = spawnSync('python3', ['-c', `
import pathlib,sys,zipfile,hashlib
base=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2])
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for file in sorted(base.rglob('*')):
  if not file.is_file() or file.name.startswith('.'):continue
  info=zipfile.ZipInfo('tuxano-booking/'+file.relative_to(base).as_posix(),(2026,1,1,0,0,0))
  info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
  z.writestr(info,file.read_bytes())
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
print(hashlib.sha256(out.read_bytes()).hexdigest())
`, output, zip], { encoding: 'utf8' });
if (packaged.status !== 0) throw new Error(packaged.stderr || 'Plugin packaging failed.');
const checksum = packaged.stdout.trim();
await writeFile(zip + '.sha256', checksum + '  ' + filename + '\n');
console.log(JSON.stringify({ files: count, zip: 'releases/' + filename, sha256: checksum }));
