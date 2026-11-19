/**
 * Load the built client bundle the way the DSH web shell does, without a
 * browser: install a fake `window.__ModuleLoader__`, run the closure factory,
 * and apply the plugin against a fake Context.
 *
 * It catches load-time mistakes — a wrong registration id, a missing export, a
 * stale slot name — and pins the two seats this plugin must always take.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
const nodeRequire = createRequire(join(pkgRoot, 'package.json'))
// The shell seeds the UI primitives in the module table; Node cannot load that
// package here (it carries CSS and a browser runtime), so the loader hands back
// a stub with the components the bundle imports.
const SHARED_PRIMITIVES = '@deepseek-ai/dsh-client-ui-primitives'
const require = specifier => specifier === SHARED_PRIMITIVES
  ? { Menu: () => null }
  : nodeRequire(specifier)
const source = readFileSync(join(pkgRoot, 'lib/client.js'), 'utf8')

// apply() injects a stylesheet through the DOM; a bare stub is enough here.
globalThis.document = {
  documentElement: { setAttribute() {}, removeAttribute() {} },
  createElement: () => ({ textContent: '', remove() {} }),
  head: { appendChild() {} },
}
globalThis.window = {
  __ModuleLoader__: { load: () => {} },
  setTimeout: () => 0,
  clearTimeout: () => {},
}

let registration
globalThis.window.__ModuleLoader__ = { load: value => { registration = value } }
new Function('window', 'require', source)(globalThis.window, require)
assert.equal(registration.id, pkg.name, 'bundle id must equal the package name')

const plugin = registration.factory(require)
assert.equal(typeof plugin.apply, 'function', 'client plugin must export apply')
assert.deepEqual(plugin.inject, ['slots', 'locale', 'configForms', 'sidebarRight', 'sidebarRightTabs'], 'inject must declare its services')

const calls = []
plugin.apply({
  get: () => undefined,
  locale: { register: (ns, dictionaries) => {
    calls.push(`locale:${ns}:${Object.keys(dictionaries).sort().join('/')}`)
    return () => {}
  } },
  effect: execute => { calls.push('effect'); return execute() },
  configForms: {
    get: id => {
      calls.push(`form:${id}`)
      return {
        getSnapshot: () => ({ value: { presets: [] }, status: 'ready', writable: true, revision: 1 }),
        subscribe: () => () => {},
        mutate: async () => true,
      }
    },
  },
  slots: {
    inject: (slot, factory) => { calls.push(`inject:${slot}`); return factory() },
    register: (options) => { calls.push(`register:${options.name}#${options.key ?? options.id}`); return () => {} },
  },
  sidebarRight: {
    openTab: kind => { calls.push(`openTab:${kind}`) },
  },
  sidebarRightTabs: {
    register: definition => { calls.push(`tab:${definition.id}:${definition.kind}`); return () => {} },
  },
})

assert.ok(calls.includes('inject:conversation.composer.dock'), 'must wait on the composer dock')
assert.ok(calls.includes('register:conversation.composer.dock#highlight-notes.annotations'), 'must add the dock pill')
assert.ok(calls.includes('inject:shell.overlay'), 'must wait on the shell overlay')
assert.ok(calls.includes('register:shell.overlay#highlight-notes.overlay'), 'must render the overlay surfaces')
assert.ok(calls.includes('tab:dsh-plugin-highlight-notes:highlight-notes'), 'must register the sidebar tab type')
assert.ok(calls.includes('inject:sidebar.right.pane.tab'), 'must wait on the sidebar tab seat')
assert.ok(calls.includes('register:sidebar.right.pane.tab#dsh-plugin-highlight-notes'), 'must render the tab body')
assert.ok(calls.some(call => call.startsWith('register:settings.section#')), 'must offer the settings section')
assert.ok(calls.includes('form:dsh-plugin-highlight-notes'), 'must read its own settings namespace')
assert.ok(calls.some(call => call.startsWith('locale:highlight-notes:')), 'must register its dictionaries')

console.log(`ok ${pkg.name}: ${calls.join(' | ')}`)
