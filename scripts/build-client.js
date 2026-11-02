import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, 'dist', 'assets');

export async function buildClient() {
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: {
      viewer: 'client/viewer.js',
      'legacy-viewer': 'client/legacy-viewer.js'
    },
    outdir: OUT_DIR,
    bundle: true,
    splitting: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    entryNames: '[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    legalComments: 'linked',
    metafile: true,
    write: false
  });

  const files = new Map(result.outputFiles.map(file => [
    '/assets/' + path.relative(OUT_DIR, file.path).split(path.sep).join('/'),
    Buffer.from(file.contents)
  ]));
  const entries = {};
  for (const [output, metadata] of Object.entries(result.metafile.outputs)) {
    if (!metadata.entryPoint) continue;
    const name = path.basename(metadata.entryPoint, '.js');
    entries[name] = '/' + path.relative(path.join(ROOT, 'dist'), path.resolve(ROOT, output)).split(path.sep).join('/');
  }
  return { entries, files };
}
