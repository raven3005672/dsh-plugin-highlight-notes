/**
 * Browser half of the plugin.
 *
 * Two seats: a pill in the composer dock (session scope, where the composer's
 * input actions and the current session id are available) and the floating
 * panel plus selection menu on the shell overlay layer (root scope). The
 * store in between holds annotations per session; nothing here touches
 * Sessions, model requests, or the workspace.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { AnnotationPill } from './AnnotationPill.tsx'
import { NotesList } from './NotesList.tsx'
import { SelectionLayer } from './SelectionLayer.tsx'
import { SettingsSection } from './SettingsSection.tsx'
import type { Preset } from './contract.ts'
import { en, zh, type CopyKey } from './locales.ts'
import { NotesStore } from './store.ts'
import { STYLES } from './styles.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'highlight-notes'

/** Services this plugin reads. */
export const inject = ['slots', 'locale', 'configForms', 'sidebarRight', 'sidebarRightTabs']

/** Copy namespace this plugin owns. */
const LOCALE_NS = 'highlight-notes'

/** Right-sidebar tab type this plugin contributes. */
const TAB_ID = 'dsh-plugin-highlight-notes'
/** Kind the tab is opened by; the shell resolves the body through it. */
const TAB_KIND = 'highlight-notes'

/** Settings namespace this plugin owns: the row id in the profile patch. */
const SETTINGS_NAMESPACE = 'dsh-plugin-highlight-notes'


declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Annotation copy. */
    'highlight-notes': CopyKey
  }
}

/** Standard seats of a composer-dock entry plus this plugin's copy. */
type DockProps = PropsRuntime<'conversation.composer.dock'> & PropsLocale<'highlight-notes'>

/** Standard seats of an overlay entry plus this plugin's copy. */
type OverlayProps = PropsRuntime<'shell.overlay'> & PropsLocale<'highlight-notes'>

/** Standard seats of a right-sidebar tab body plus this plugin's copy. */
type TabProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'highlight-notes'>

/**
 * Register both seats and the stylesheet.
 * @param ctx - client Context.
 */
export function apply(ctx: Context): void {
  const store = new NotesStore()
  store.loadDiagnostics()

  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }))

  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = STYLES
    document.head.appendChild(style)
    return () => { style.remove() }
  })

  ctx.effect(() => () => { store.dispose() })

  // Configured shortcuts reach the panel through the store; an absent service
  // (or an empty list) leaves the built-in, localized set in place.
  ctx.effect(() => {
    const form = ctx.configForms.get<{ presets?: Preset[] }>(SETTINGS_NAMESPACE)
    const sync = (): void => {
      const snapshot = form.getSnapshot()
      // An unset array resolves to [], which reads the same as "the user
      // deleted every shortcut"; presence in the user layer separates them.
      const stored = typeof snapshot.user === 'object' && snapshot.user !== null
        && Object.hasOwn(snapshot.user, 'presets')
      store.setPresets(stored ? snapshot.value?.presets ?? [] : undefined)
    }
    // Subscribe before the first read: a change landing between the two would
    // otherwise be lost.
    const unsubscribe = form.subscribe(sync)
    sync()
    return () => { unsubscribe() }
  })

  /**
   * Dock entry: binds the store to the session and the composer's actions.
   * @param props - session-standard seats plus copy.
   * @returns the pill.
   */
  const openTab = (): void => { ctx.sidebarRight.openTab(TAB_KIND) }

  const Dock = (props: DockProps) => {
    const draft = props.useInput((state: { draft: string }) => state.draft)
    const phase = props.useInput((state: { phase: string }) => state.phase)
    const occurrences = props.useInput((state: { occurrences: readonly unknown[] }) => state.occurrences.length)
    return (
      <AnnotationPill
        store={store}
        t={props.t}
        sessionId={props.sessionId}
        inputActions={props.inputActions}
        draft={draft}
        phase={phase}
        occurrences={occurrences}
        openTab={openTab}
      />
    )
  }

  /**
   * Right-sidebar tab body: the same list, hosted by the shell's dockable
   * column instead of a floating card, so opening it never squeezes the
   * transcript.
   * @param props - the tab's standard seats plus copy.
   * @returns the tab body.
   */
  const NotesTab = (props: TabProps) => (
    <div className="dsh-notes-tab">
      <NotesList store={store} t={props.t} variant="tab" />
    </div>
  )

  /**
   * Overlay entry: the panel, selection menu, note composer and toast.
   * @param props - overlay seats plus copy.
   * @returns the overlay surfaces.
   */
  const Overlay = (props: OverlayProps) => <SelectionLayer store={store} t={props.t} />

  // `inject` waits for the declaration: a composition without the conversation
  // dock simply never mounts the pill instead of failing at load.
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
    { name: 'conversation.composer.dock', id: 'highlight-notes.annotations', order: 2, locale: LOCALE_NS },
    Dock,
  ))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'highlight-notes.overlay', locale: LOCALE_NS },
    Overlay,
  ))

  // The tab type is static: what it is and how its chip reads.
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: TAB_KIND,
    // One page per kind: opening again focuses the tab already showing it.
    keepMounted: true,
    title: () => ctx.locale.bind(LOCALE_NS)('panel.title'),
    guide: [{
      id: 'notes',
      order: 30,
      title: () => ctx.locale.bind(LOCALE_NS)('panel.title'),
      description: () => ctx.locale.bind(LOCALE_NS)('pill.tip'),
    }],
  }), 'highlight-notes: sidebar tab type')

  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: LOCALE_NS },
    NotesTab,
  ))

  // Settings page section, not a plugin-row config: appearance-and-vocabulary
  // preferences belong where General and Models live. `label` must be a
  // function so the nav entry follows the current language.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'highlight-notes',
    order: 40,
    label: () => ctx.locale.bind(LOCALE_NS)('nav'),
    locale: LOCALE_NS,
    inject: () => ({
      form: ctx.configForms.get<{ presets?: Preset[] }>(SETTINGS_NAMESPACE),
      diagnostics: () => store.diagnosticsReport(),
    }),
  }, SettingsSection))
}
