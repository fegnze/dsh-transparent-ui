// Build the current source in memory: source-only reviews must not rewrite lib/.
import * as esbuild from 'esbuild'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export async function buildSourceClient() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const result = await esbuild.build({
    absWorkingDir: root, entryPoints: ['src/client/index.ts'], bundle: true,
    write: false, format: 'cjs', platform: 'browser', target: 'es2022',
    tsconfigRaw: {}, jsx: 'automatic', external: ['@deepseek-ai/*', 'react', 'react/*'],
    plugins: [{ name: 'test-css', setup(build) {
      build.onLoad({ filter: /\.css$/ }, async ({ path: file }) => {
        const output = await esbuild.build({
          stdin: { contents: `import styles from ${JSON.stringify(file)}; export default styles`, resolveDir: root, loader: 'js' },
          bundle: true, write: false, format: 'esm', tsconfigRaw: {},
          loader: { '.css': 'local-css' }, outdir: 'out', minifySyntax: true, minifyWhitespace: true,
          minifyIdentifiers: false,
        })
        const js = output.outputFiles.find(f => f.path.endsWith('.js')).text
        const css = output.outputFiles.find(f => f.path.endsWith('.css')).text
        const id = `@deepseek-ai/dsh-client-ui-aqua/${path.basename(file)}`
        return { loader: 'js', contents: `${js}\nconst tag = document.createElement('style'); tag.dataset.plugin = ${JSON.stringify(pkg.name)}; tag.dataset.pluginCss = ${JSON.stringify(id)}; tag.textContent = ${JSON.stringify(css)}; document.head.appendChild(tag);` }
      })
    } }],
  })
  return `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => { const module = {exports:{}}; const exports = module.exports; ${result.outputFiles[0].text}\nreturn module.exports; } });`
}
