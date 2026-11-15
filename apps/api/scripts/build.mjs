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
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  plugins: [externalNpm],
  logLevel: 'info',
});
