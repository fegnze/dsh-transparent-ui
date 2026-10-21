import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'
import { buildSourceClient } from './source-client.mjs'

const source = await readFile(new URL('../src/client/aqua.module.css', import.meta.url), 'utf8')
const built = await buildSourceClient()
const compiled = [...built.matchAll(/tag\d*\.textContent = ([\s\S]*?);\s*document\.head\.appendChild\(tag\d*\)/g)]
  .map(m => vm.runInNewContext(m[1])).find(css => css.includes('data-dsh-aqua-sidebar-density'))
assert.ok(compiled)

// Observed host suffixes, no generated hashes; simulated DOM, not native drag acceptance.
const host = `.host_logoRow{height:60px;padding:8px 0 8px 4px;margin-bottom:4px}.host_topStrip{height:52px}.host_panelList{gap:4px;margin-bottom:8px}.host_panelRow{min-height:36px;padding:7px 8px}.host_sectionHeader{height:36px;margin-top:2px;margin-bottom:4px}[role=treeitem]{height:34px;padding:0 8px;padding-inline-start:24px}.host_title{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.host_time{display:block}.nativeDrag{-webkit-app-region:drag}#chat{font-size:15px}`
for (const [label, css] of [['source', source], ['compiled source', compiled]]) {
  for (const enabled of [true, false]) for (const collapsed of [true, false]) {
    test(`${label}: compact scope enabled=${enabled}, collapsed=${collapsed}`, async () => {
      const w = new Window()
      try {
        const root = w.document.documentElement
        if (enabled) root.setAttribute('data-dsh-aqua', '')
        root.setAttribute('data-dsh-aqua-sidebar-density', 'regular')
        w.document.head.innerHTML = `<style>${host}</style><style>${css}</style>`
        w.document.body.innerHTML = `<div data-dsh-frame ${collapsed ? 'data-sidebar-collapsed' : ''}><aside data-dsh-sidebar-root><div id="strip" class="host_topStrip nativeDrag"></div><div id="brand" class="host_logoRow">Aqua</div><div id="nav" class="host_panelList"><button id="panel" class="host_panelRow"><span class="host_panelTitle">工作台</span></button></div><div id="section" class="host_sectionHeader">工作区</div><div id="row" role="treeitem" data-row-key="session:one"><span id="title" class="host_title">完整长标题</span><span id="time" class="host_time">1分钟</span><button id="action">操作</button></div></aside></div><main id="chat">正文</main><div id="outside" class="host_logoRow">设置</div>`
        const style = id => w.getComputedStyle(w.document.getElementById(id))
        const properties = ['height', 'minHeight', 'paddingTop', 'paddingBottom', 'marginBottom', 'gap']
        const ids = ['brand', 'nav', 'panel', 'section', 'row', 'strip', 'outside', 'chat']
        const before = Object.fromEntries(ids.map(id => [id, properties.map(p => style(id)[p])]))
        assert.equal(style('brand').height, '60px', 'regular keeps original branding geometry')
        root.setAttribute('data-dsh-aqua-sidebar-density', 'compact')
        // happy-dom does not invalidate descendant computed styles on ancestor
        // attribute updates; rebuild descendants/styles for each CSS snapshot.
        // This tests rule scope, not the real browser's live reflow engine.
        w.document.head.innerHTML = `<style>${host}</style><style>${css}</style>`
        w.document.body.innerHTML = w.document.body.innerHTML
        const active = enabled && !collapsed
        if (active) {
          assert.equal(style('brand').height, '44px')
          assert.equal(style('nav').gap, '2px')
          assert.equal(style('section').minHeight, '28px')
          assert.equal(style('row').height, 'auto')
          assert.equal(style('row').paddingTop, '2px')
          assert.equal(style('row').paddingInlineStart, '24px', 'indentation remains native')
        } else for (const id of ids) assert.deepEqual(properties.map(p => style(id)[p]), before[id], id)
        for (const id of ['strip', 'outside', 'chat']) assert.deepEqual(properties.map(p => style(id)[p]), before[id], id)
        assert.equal(style('chat').fontSize, '15px')
        assert.equal(style('title').whiteSpace, 'nowrap')
        assert.equal(style('title').textOverflow, 'ellipsis')
        for (const id of ['title', 'time', 'action']) {
          assert.notEqual(style(id).display, 'none')
          assert.notEqual(style(id).visibility, 'hidden')
        }
        root.setAttribute('data-dsh-aqua-sidebar-density', 'regular')
        w.document.head.innerHTML = `<style>${host}</style><style>${css}</style>`
        w.document.body.innerHTML = w.document.body.innerHTML
        for (const id of ids) assert.deepEqual(properties.map(p => style(id)[p]), before[id], `regular restores ${id}`)
      } finally { await w.happyDOM.close() }
    })
  }
}

test('compact brand spacing preserves the Windows titlebar reservation', async () => {
  const w = new Window()
  try {
    for (const [key, value] of [['data-dsh-aqua', ''], ['data-dsh-aqua-sidebar-density', 'compact'], ['data-windows-titlebar', '']]) w.document.documentElement.setAttribute(key, value)
    w.document.head.innerHTML = `<style>${source}</style>`
    w.document.body.innerHTML = '<div data-dsh-frame><aside data-dsh-sidebar-root><div id="brand" class="host_logoRow">Aqua</div></aside></div>'
    assert.equal(w.getComputedStyle(w.document.getElementById('brand')).height, '40px')
  } finally { await w.happyDOM.close() }
})

test('compact block does not alter native drag, zoom, font, visibility or rail geometry', () => {
  const compact = source.slice(source.indexOf('/* Compact-only geometry.'), source.indexOf('/* ---------- Canvas:'))
  assert.doesNotMatch(compact, /(?:-webkit-app-region|zoom|font-size|display|visibility|overflow|width|transform)\s*:/)
  assert.doesNotMatch(compact, /_topStrip["'\]]/)
  for (const rule of compact.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    assert.match(rule[1], /data-dsh-aqua/)
    assert.match(rule[1], /data-dsh-aqua-sidebar-density="compact"/)
    assert.match(rule[1], /:not\(\[data-sidebar-collapsed\]\)/)
  }
})
