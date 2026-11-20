// Bundle the deployed API entry into one ESM file. Workspace packages (@projectx/*, TypeScript sources) are inlined;
// real npm packages stay external and are loaded from node_modules at runtime (avoids bundling SDK quirks).
import { build } from 'esbuild';

const externalNpm = {
  name: 'external-npm',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith('@projectx/') || args.path.startsWith('node:')) return undefined;
      return { path: args.path, external: true };
    });
  },
};

await build({
  // server: the Cloud Run service. publish-official: a Cloud Run Job (docs/CONTENT_SOURCES.md, owner decision 2026-11-20).
  entryPoints: { server: 'src/server.ts', 'publish-official': 'src/jobs/publish-official.ts', 'pyq-official': 'src/jobs/pyq-official.ts', 'rate-difficulty': 'src/jobs/rate-difficulty.ts', 'classify-chapters': 'src/jobs/classify-chapters.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  plugins: [externalNpm],
  logLevel: 'info',
});
