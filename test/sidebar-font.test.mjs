import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'

const source = await readFile(new URL('../src/client/aqua.module.css', import.meta.url), 'utf8')
const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const compiled = [...bundle.matchAll(/tag\.textContent = ([\s\S]*?);\n\s*document\.head\.appendChild\(tag\)/g)]
  .map(m => vm.runInNewContext(m[1])).find(css => css.includes('--dsh-aqua-sidebar-font-size'))
assert.ok(compiled)

// Fixture follows the observed 0.2.1-rc.2 DOM with better-sidebar active;
// no hash prefix is part of the contract. It is not a visual browser acceptance.
for (const [label, css] of [['source', source], ['bundle', compiled]]) {
  for (const enabled of [true, false]) {
    test(`${label}: sidebar typography scope, theme enabled=${enabled}`, async () => {
      const w = new Window()
      try {
        if (enabled) w.document.documentElement.setAttribute('data-dsh-aqua', '')
        w.document.documentElement.style.setProperty('--dsh-aqua-sidebar-font-size', '20px')
        w.document.documentElement.style.setProperty('--dsh-aqua-sidebar-session-size', '19px')
        w.document.documentElement.style.setProperty('--dsh-aqua-sidebar-meta-size', '17px')
        w.document.head.innerHTML = `<style>${css}</style><style>.host_panelTitle,.host_title{font-size:14px;line-height:20px}.host_time{font-size:12px}.host_title{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}#chat,#settings{font-size:15px}</style>`
        w.document.body.innerHTML = `<aside data-dsh-sidebar-root><span id="nav" class="host_panelTitle">工作台</span><div role="treeitem" data-row-key="project:one"><span id="workspace" class="host_title">MySpace</span></div><div role="treeitem" data-row-key="session:one"><span id="session" class="host_title">很长的会话标题</span><span id="time" class="host_time">1分钟</span></div><span id="account" class="host_title">账号</span></aside><main id="chat">正文</main><div id="settings">设置<span id="outsideTitle" class="host_title">标题</span></div>`
        const style = id => w.getComputedStyle(w.document.getElementById(id))
        for (const id of ['nav', 'workspace']) assert.equal(style(id).fontSize, enabled ? '20px' : '14px')
        assert.equal(style('session').fontSize, enabled ? '19px' : '14px')
        assert.equal(style('time').fontSize, enabled ? '17px' : '12px')
        assert.equal(style('account').fontSize, '14px')
        assert.equal(style('outsideTitle').fontSize, '14px')
        assert.equal(style('chat').fontSize, '15px')
        assert.equal(style('settings').fontSize, '15px')
        assert.equal(style('session').textOverflow, 'ellipsis')
        assert.equal(style('session').whiteSpace, 'nowrap')
        if (enabled) assert.equal(style('session').lineHeight, '1.5')
      } finally { await w.happyDOM.close() }
    })
  }
}
