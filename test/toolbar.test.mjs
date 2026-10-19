import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Window } from 'happy-dom'

// 只验证回退后的 CSS 层叠；happy-dom 不执行 Electron 原生拖动或点击命中。
const interactive = ['button', 'a', 'input', 'select', 'textarea', 'summary', '[contenteditable="true"]', '[tabindex]',
  ...['dialog', 'alertdialog', 'menu', 'listbox', 'tooltip', 'button', 'link', 'tab', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'option', 'checkbox', 'radio', 'switch', 'slider', 'combobox', 'textbox'].map(role => `[role="${role}"]`)]
const hostDrag = `html[data-platform=darwin] [data-window-drag]{-webkit-app-region:drag}
  html[data-platform=darwin] [data-window-drag-recall]{-webkit-app-region:no-drag}
  html[data-platform=darwin] :is(${interactive.join(',')}){-webkit-app-region:no-drag}`
const source = await readFile(process.env.DSH_TEST_CSS || new URL('../src/client/aqua.module.css', import.meta.url), 'utf8')
const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
// 解析产物中的样式字面量，避免依赖 esbuild 选择双引号还是模板字符串。
const compiled = [...bundle.matchAll(/tag\.textContent = ([\s\S]*?);\n\s*document\.head\.appendChild\(tag\)/g)]
  .map(match => vm.runInNewContext(match[1])).find(css => css.includes('header[data-window-drag]'))
assert.ok(compiled, '客户端产物必须包含顶栏样式')

for (const [label, css] of [['源码', source], ['构建产物', compiled]]) {
  for (const hostLast of [false, true]) {
    test(`${label}：回退后 header 全子树 CSS 为 no-drag（非原生验收），宿主样式后加载=${hostLast}`, async () => {
      const window = new Window()
      const document = window.document
      document.documentElement.setAttribute('data-platform', 'darwin')
      document.documentElement.setAttribute('data-dsh-aqua', '')
      document.head.innerHTML = (hostLast ? [css, hostDrag] : [hostDrag, css]).map(text => `<style>${text}</style>`).join('')
      document.body.innerHTML = `<div id="outside" data-window-drag><span></span></div>
        <header data-window-drag><div data-conversation-header-leading><div data-slot="conversation.header.leading"></div></div>
          <div id="blank"><span>标题空白</span></div><div id="controls" data-slot="conversation.session.header"></div>
          <div id="recall" data-window-drag-recall><span data-window-drag><svg><path /></svg></span></div></header>`
      const region = element => window.getComputedStyle(element).getPropertyValue('-webkit-app-region')
      try {
        const controls = document.getElementById('controls')
        for (const selector of interactive) {
          const tag = selector.startsWith('[') ? 'div' : selector
          const control = document.createElement(tag)
          const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/)
          if (attribute) control.setAttribute(attribute[1], attribute[2] ?? '0')
          control.setAttribute('data-window-drag', '')
          controls.append(control)
          if (!['input', 'textarea', 'select'].includes(tag)) control.innerHTML = '<span data-window-drag><svg data-window-drag><path data-window-drag /></svg></span>'
          assert.equal(region(control), 'no-drag', selector)
          for (const child of control.querySelectorAll('*')) assert.equal(region(child), 'no-drag', `${selector} ${child.tagName}`)
        }
        const header = document.querySelector('header')
        assert.equal(region(header), 'no-drag')
        assert.equal(region(document.getElementById('blank')), 'no-drag', '止损回退包括顶栏空白')
        assert.equal(region(document.querySelector('[data-conversation-header-leading]')), 'no-drag')
        for (const node of document.querySelectorAll('#recall, #recall *')) assert.equal(region(node), 'no-drag')
        for (const owner of [header, document.body]) {
          owner.setAttribute('data-window-drag-recall', '')
          for (const node of [header, ...header.querySelectorAll('*')]) assert.equal(region(node), 'no-drag', 'recall 包括顶栏自身与祖先')
          owner.removeAttribute('data-window-drag-recall')
          assert.equal(region(header), 'no-drag', 'recall 结束后仍保留回退规则')
        }
        assert.equal(region(document.getElementById('outside')), 'drag', '不改变其他拖动区域')
        // 用新文档验证关闭态，避免 happy-dom 缓存根属性变化前的后代计算样式。
        const offWindow = new Window()
        try {
          offWindow.document.documentElement.setAttribute('data-platform', 'darwin')
          offWindow.document.head.innerHTML = document.head.innerHTML
          offWindow.document.body.innerHTML = document.body.innerHTML
          const offRegion = selector => offWindow.getComputedStyle(offWindow.document.querySelector(selector)).getPropertyValue('-webkit-app-region')
          assert.equal(offRegion('header'), 'drag', '主题关闭态使用上游规则')
          assert.notEqual(offRegion('#recall span'), 'no-drag', '主题关闭态不应用 Aqua 子树覆盖')
        } finally {
          await offWindow.happyDOM.close()
        }
      } finally {
        await window.happyDOM.close()
      }
    })
  }
}

const spotlightBundle = await build({
  entryPoints: [new URL('../src/client/spotlight.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'iife', globalName: 'spotlightEngine',
  platform: 'browser', target: 'es2022', tsconfigRaw: {},
})

test('native toolbar keeps cursor glow but never moves under the pointer when press is enabled', async () => {
  const window = new Window({ url: 'http://localhost/' })
  const frames = new Map()
  let nextFrame = 0
  window.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame }
  window.cancelAnimationFrame = id => frames.delete(id)
  window.matchMedia = () => ({ matches: false })
  window.document.documentElement.setAttribute('data-dsh-aqua-press', '')
  window.document.documentElement.setAttribute('data-dsh-aqua-spotlight', '')
  window.document.body.innerHTML = `<header data-window-drag data-dsh-aqua-spot><button>Action</button></header>
    <div data-dsh-surface data-dsh-aqua-spot><button>Other surface</button></div>`
  for (const spot of window.document.querySelectorAll('[data-dsh-aqua-spot]')) {
    spot.getBoundingClientRect = () => new window.DOMRect(0, 0, 300, 100)
    Object.defineProperty(spot, 'offsetWidth', { get: () => 300 })
    Object.defineProperty(spot, 'offsetHeight', { get: () => 100 })
  }
  vm.runInContext(spotlightBundle.outputFiles[0].text, vm.createContext(window))
  const stop = window.spotlightEngine.startSpotlight()
  const hover = spot => {
    spot.querySelector('button').dispatchEvent(new window.PointerEvent('pointerover', {
      bubbles: true, clientX: 240, clientY: 35,
    }))
    const pending = [...frames]
    frames.clear()
    for (const [, callback] of pending) callback(1000)
  }
  try {
    const header = window.document.querySelector('header')
    for (let i = 0; i < 20; i++) {
      hover(header)
      assert.equal(header.style.transform, '')
      assert.equal(header.style.transformOrigin, '')
      assert.ok(header.hasAttribute('data-spot-on'))
      assert.ok(header.querySelector('[data-dsh-aqua-glow]'), 'glow overlay remains available')
    }
    const surface = window.document.querySelector('[data-dsh-surface]')
    hover(surface)
    assert.match(surface.style.transform, /perspective\(800px\)/, 'press still works on non-toolbar panes')
  } finally {
    stop()
    await window.happyDOM.close()
  }
})
