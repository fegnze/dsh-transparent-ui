import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'

const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('client starts without removed settingsScope and exposes reachable settings', async () => {
  const window = new Window({ url: 'http://localhost/' })
  // Reproduce the real desktop ancestor that hid painted ambient canvases.
  window.document.head.innerHTML = '<style>._6Qf49G_centerCol { background: rgb(244, 248, 253); }</style>'
  window.document.body.innerHTML = '<div data-dsh-frame><div class="_6Qf49G_sidebarCol"></div><div class="_6Qf49G_centerCol"><div data-phase="hero"></div></div></div>'
  const center = window.document.querySelector('[class*="centerCol"]')
  assert.equal(window.getComputedStyle(center).backgroundColor, 'rgb(244, 248, 253)')
  // Disable GPU-dependent decorations for a deterministic DOM lifecycle test.
  window.localStorage.setItem('dsh.ui-aqua.enabled', 'false')
  window.localStorage.setItem('dsh.ui-aqua.mode', 'compat')
  window.localStorage.setItem('dsh.ui-aqua.background', 'wallpaper')
  window.localStorage.setItem('dsh.ui-aqua.wallpaper', 'data:image/png;base64,AA==')
  for (const flag of ['whale', 'critters', 'mesh', 'spotlight', 'press']) window.localStorage.setItem(`dsh.ui-aqua.${flag}`, 'false')
  let plugin
  const dependencies = new Set()
  const storeModule = {
    defineStore: spec => ({ spec, state: spec.init() }),
  }
  window.__ModuleLoader__ = {
    load: ({ id, factory }) => {
      assert.equal(id, pkg.name)
      plugin = factory(name => {
        dependencies.add(name)
        if (name === '@deepseek-ai/dsh-client-store') return storeModule
        if (name === 'react') return { useRef: () => ({ current: null }) }
        if (name === 'react/jsx-runtime') {
          const jsx = (type, props) => { assert.ok(type, 'JSX component must exist in current runtime'); return { type, props } }
          return { jsx, jsxs: jsx, Fragment: Symbol.for('react.fragment') }
        }
        if (name === '@deepseek-ai/dsh-client-ui-primitives') return { IconCheckOutlineRegular: () => null }
        throw new Error(`Unexpected module dependency: ${name}`)
      })
    },
  }
  vm.runInContext(code, vm.createContext(window))
  assert.deepEqual(Array.from(plugin.inject), ['theme', 'slots', 'locale'])
  const disposers = []
  const entries = []
  const listeners = new Map()
  const ctx = {
    effect(fn) { const off = fn(); if (off) disposers.push(off) },
    on(name, listener) { listeners.set(name, listener); return () => listeners.delete(name) },
    locale: { register: () => () => {} },
    theme: {
      getTheme: () => ({ active: { colorScheme: 'light' } }),
      overrideTokens(source, tokens) {
        assert.equal(source, pkg.name)
        assert.ok(tokens['--dsw-alias-bg-layer-1'])
        return () => {}
      },
    },
    slots: {
      inject(name, callback) { assert.equal(name, 'settings.general.item'); callback() },
      register(options, component) { entries.push({ options, component }); return () => {} },
    },
  }
  plugin.apply(ctx)
  assert.equal(entries.length, 2)
  assert.deepEqual(entries.map(e => e.options.id), ['aqua-toggle', 'aqua'])
  assert.ok(entries[0].options.order < entries[1].options.order)
  let toggle
  for (const { options, component } of entries) {
    const handle = options.store
    const actions = Object.fromEntries(Object.entries(handle.spec.actions).map(([name, action]) => [name, (...args) => action(handle.state, ...args)]))
    const injected = options.inject(actions)
    assert.equal(handle.state.enabled, false)
    const rendered = component({ ...injected, t: key => key, useStore: selector => selector(handle.state) })
    if (options.id === 'aqua-toggle') { assert.equal(rendered.type, 'div'); toggle = injected.setEnabled }
    else assert.equal(rendered, null)
  }
  toggle(true)
  assert.equal(window.document.documentElement.hasAttribute('data-dsh-aqua'), true)
  assert.equal(window.document.documentElement.hasAttribute('data-dsh-compat'), true)
  assert.ok(window.document.querySelector('[data-dsh-aqua-ambient]'))
  assert.ok(window.document.querySelectorAll('[data-aqua-critter]').length > 0)
  assert.equal(window.getComputedStyle(window.document.body).isolation, 'isolate', 'negative-z ambient layer needs a body stacking context')
  assert.ok(['transparent', 'rgba(0, 0, 0, 0)'].includes(window.getComputedStyle(center).backgroundColor), 'desktop center column must not cover painted ambient canvases')
  assert.equal(entries[0].options.store.state.enabled, true)
  assert.equal(entries[1].options.store.state.enabled, true)
  // Render both settings entries while enabled, including every decoration icon.
  for (const { options, component } of entries) {
    const handle = options.store
    for (const flag of ['whale', 'critters', 'mesh', 'spotlight', 'press']) handle.state[flag] = true
    const actions = Object.fromEntries(Object.entries(handle.spec.actions).map(([name, action]) => [name, (...args) => action(handle.state, ...args)]))
    const injected = options.inject(actions)
    for (const flag of ['whale', 'critters', 'mesh', 'spotlight', 'press']) handle.state[flag] = true
    assert.ok(component({ ...injected, t: key => key, useStore: selector => selector(handle.state) }))
    if (options.id === 'aqua') {
      assert.equal(handle.state.sidebarFontSize, 16)
      assert.equal(window.document.documentElement.style.getPropertyValue('--dsh-aqua-sidebar-font-size'), '16px')
      for (const [input, expected] of [[20, 20], [100, 22], [-2, 12], [17.6, 18], [NaN, 16], [Infinity, 16]]) {
        injected.setSidebarFontSize(input)
        assert.equal(handle.state.sidebarFontSize, expected)
        assert.equal(window.localStorage.getItem('dsh.ui-aqua.sidebarFontSize'), String(expected))
        assert.equal(window.document.documentElement.style.getPropertyValue('--dsh-aqua-sidebar-font-size'), `${expected}px`)
        assert.equal(window.document.documentElement.style.getPropertyValue('--dsh-aqua-sidebar-meta-size'), `${Math.max(11, expected - 3)}px`)
      }
      injected.setSidebarFontSize(19)
      toggle(false)
      toggle(true)
      assert.equal(handle.state.sidebarFontSize, 19)
      assert.equal(window.document.documentElement.style.getPropertyValue('--dsh-aqua-sidebar-font-size'), '19px')
      injected.setMode('mica')
      assert.equal(window.document.documentElement.style.getPropertyValue('--dsh-aqua-sidebar-font-size'), '19px')
      injected.setMode('compat')
      injected.setBlur(40)
      injected.setFrost(100)
      assert.equal(window.document.documentElement.style.getPropertyValue('--dsh-aqua-blur'), '40px')
      assert.equal(window.document.documentElement.style.getPropertyValue('--dsh-aqua-frost'), '1.4')
      injected.setBlur(0)
      injected.setFrost(0)
      assert.equal(window.document.documentElement.style.getPropertyValue('--dsh-aqua-blur'), '0px')
      assert.equal(window.document.documentElement.style.getPropertyValue('--dsh-aqua-frost'), '0')
    }
  }
  toggle(false)
  assert.equal(window.document.documentElement.hasAttribute('data-dsh-aqua'), false)
  for (const dispose of disposers.splice(0).reverse()) dispose()
  assert.equal(window.document.documentElement.hasAttribute('data-dsh-aqua'), false)
  // A new plugin lifecycle reads the persisted value (not the old store).
  entries.length = 0
  plugin.apply(ctx)
  const restored = entries.find(e => e.options.id === 'aqua')
  const restoredHandle = restored.options.store
  restored.options.inject(Object.fromEntries(Object.entries(restoredHandle.spec.actions).map(([name, action]) => [name, (...args) => action(restoredHandle.state, ...args)])))
  assert.equal(restoredHandle.state.sidebarFontSize, 19)
  for (const dispose of disposers.reverse()) dispose()
  assert.equal(window.document.documentElement.hasAttribute('data-dsh-aqua'), false)
  assert.equal(window.document.querySelectorAll('style[data-plugin-css]').length, 4)
  // Compiling CSS modules independently must not reuse minified class names.
  const classOwners = new Map()
  for (const style of window.document.querySelectorAll('style[data-plugin-css]')) {
    assert.equal(style.dataset.plugin, pkg.name)
    assert.ok(style.dataset.pluginCss.startsWith('@deepseek-ai/dsh-client-ui-aqua/'), 'preserve CSS hook identity')
    for (const match of style.textContent.matchAll(/\.([A-Za-z_][\w-]*)\s*(?=[{,: >+~.#\[])/g)) {
      const name = match[1]
      const owner = classOwners.get(name)
      assert.ok(!owner || owner === style.dataset.pluginCss, `CSS class ${name} collides between ${owner} and ${style.dataset.pluginCss}`)
      classOwners.set(name, style.dataset.pluginCss)
    }
  }
  for (const name of dependencies) {
    if (name.startsWith('@deepseek-ai/')) assert.ok(pkg.dsh.client.inject.includes(name), `undeclared module ${name}`)
  }
  await window.happyDOM.close()
})

test('package declares current store dependency and ships profile overlay', () => {
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-client-store'], '^0.2.0-rc.2')
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-client-runtime'], undefined)
  assert.ok(pkg.files.includes('cordis.patch.yml'))
  const supportedRuntimes = pkg.engines.dsh.split('||').map(version => version.trim())
  assert.ok(supportedRuntimes.includes('0.2.0-rc.2'), 'retain the previously supported runtime')
  assert.ok(supportedRuntimes.includes('0.2.1-rc.2'), 'allow the verified desktop runtime')
  assert.ok(supportedRuntimes.every(version => /^\d+\.\d+\.\d+-rc\.\d+$/.test(version)), 'do not silently allow unverified future runtimes')
})

test('renamed package metadata and invariant self-reference stay consistent', async () => {
  assert.equal(pkg.name, 'dsh-transparent-ui')
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'package version must be a release version, not a fixed historical value')
  assert.equal(pkg.repository.url, 'git+https://github.com/fegnze/dsh-transparent-ui.git')
  assert.equal(pkg.homepage, 'https://github.com/fegnze/dsh-transparent-ui')
  assert.equal(pkg.bugs.url, 'https://github.com/fegnze/dsh-transparent-ui/issues')
  const invariant = await import('dsh-transparent-ui/invariant')
  let owner
  await invariant.apply({ invariants: { register(name) { owner = name; return () => {} } } })
  assert.equal(owner, pkg.name)
})

test('profile overlay imports the renamed package while retaining its component ID', async () => {
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const name = patch.match(/^\s+name:\s*['"]([^'"]+)['"]/m)?.[1]
  assert.equal(name, pkg.name)
  assert.match(patch, /id: ui-aqua/)
  const host = await import(new URL('../lib/index.js', import.meta.url))
  assert.equal(typeof host.apply, 'function')
})

test('desktop fluid is sidebar-bound and toolbar uses bounded scroll overlap', async () => {
  const css = await readFile(new URL('../src/client/aqua.module.css', import.meta.url), 'utf8')
  assert.match(css, /width: var\(--dsh-aqua-fluid-width, 0px\)/)
  assert.match(css, /-webkit-app-region: no-drag/)
  assert.doesNotMatch(css, /margin-top: -95px/)
  assert.match(css, /margin-top: calc\(0px - var\(--dsh-aqua-header-overlap, 0px\)\)/)
  assert.match(css, /:has\(> \[data-conversation-scroll\]\)\s*\{\s*position: relative;\s*z-index: 0;/)
  const mesh = await readFile(new URL('../src/client/mesh.ts', import.meta.url), 'utf8')
  assert.match(mesh, /LINE_ALPHA = 0\.15/)
  assert.match(mesh, /DOT_ALPHA = 0\.3/)
})

test('primary glass surfaces share upstream material with no duplicate composer plate', async () => {
  const css = await readFile(new URL('../src/client/aqua.module.css', import.meta.url), 'utf8')
  assert.match(css, /:is\(header, \[data-composer-card\], \[data-shortcut-modal='settings'\]\)/)
  assert.doesNotMatch(css, /--dsh-aqua-settings-frost/)
  assert.match(css, /calc\(42% \* var\(--dsh-aqua-frost, 1\)\)/)
  assert.match(css, /calc\(50% \* var\(--dsh-aqua-frost, 1\)\)/)
})
