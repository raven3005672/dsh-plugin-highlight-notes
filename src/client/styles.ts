/**
 * The plugin's stylesheet: highlight pseudo-element colours plus the panel,
 * menu and composer chrome. Injected once per document.
 *
 * Colours come from the shell's semantic tokens so the surface follows the
 * light and dark palettes without a second definition.
 */
export const STYLES = `
/* The foreground is pinned to a dark ink: the amber plate is light in both
   palettes, so inheriting the dark theme's near-white text would wash out. */
::highlight(dsh-notes-quote) {
  background-color: color-mix(in srgb, #ffc400 72%, transparent);
  color: #1f2328;
}
::highlight(dsh-notes-quote-active) {
  background-color: color-mix(in srgb, #ff8f00 88%, transparent);
  color: #1f2328;
}
/* Plain marks are a cool plate so a page full of them reads as "noted", not
   "still to do". Kept light enough for the pinned dark ink in both palettes. */
::highlight(dsh-notes-mark) {
  background-color: color-mix(in srgb, #7dd3fc 72%, transparent);
  color: #1f2328;
}
::highlight(dsh-notes-mark-active) {
  background-color: color-mix(in srgb, #38bdf8 88%, transparent);
  color: #1f2328;
}

/* Matches the shipped statistics pills: 22px tall, 12px muted text, no
   border, 8px radius, transparent until hover. */
.dsh-notes-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 1px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #81858c);
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
  white-space: nowrap;
  /* The shipped pills sit one step lighter than label-secondary; matching the
     composite means fading the whole control rather than picking a new token. */
  opacity: 0.8;
}
.dsh-notes-pill svg {
  width: 14px;
  height: 14px;
  flex: none;
}
.dsh-notes-pill:hover {
  background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2328);
  opacity: 1;
}
.dsh-notes-pill-count {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* Hosted by the right sidebar tab: the list owns the column's height and
   scrolls inside it, so nothing here measures the transcript. */
.dsh-notes-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 12px 12px 0;
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-notes-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-notes-panel-title {
  flex: none;
  white-space: nowrap;
}
.dsh-notes-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  max-width: 132px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-notes-trigger:hover {
  background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-notes-trigger[aria-expanded='true'] {
  background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.06));
}

.dsh-notes-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 8px 0;
  list-style: none;
}
.dsh-notes-empty {
  padding: 10px 12px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 12px;
  line-height: 1.7;
}
/* Option A: the row is transparent; the kind is carried by the 3px colour bar
   alone, and hover/selection are neutral washes. Tinted fills on every row
   made the list read as a colour chart next to the conversation. */
.dsh-notes-item {
  --dsh-notes-accent: #b6bcc6;
  border: 0;
  border-left: 3px solid var(--dsh-notes-accent);
  border-radius: 8px;
  padding: 6px 8px 6px 9px;
  margin-bottom: 8px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.55);
  box-shadow: 0 1px 3px rgba(15, 17, 21, 0.07), 0 0 1px rgba(15, 17, 21, 0.1);
  transition: background-color 120ms ease;
}
.dsh-notes-item[data-kind='quote'] {
  --dsh-notes-accent: #f0b429;
}
.dsh-notes-item[data-kind='mark'] {
  --dsh-notes-accent: #38a3e8;
}
.dsh-notes-item:hover {
  background: rgba(38, 49, 72, 0.04);
}
.dsh-notes-item:focus-visible {
  outline: none;
  box-shadow:
    0 1px 3px rgba(15, 17, 21, 0.09),
    0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #2563eb));
}
.dsh-notes-item[data-active='true'] {
  background: rgba(38, 49, 72, 0.07);
  box-shadow:
    0 1px 3px rgba(15, 17, 21, 0.09),
    0 0 1px rgba(15, 17, 21, 0.12),
    inset 0 0 0 1px rgba(15, 17, 21, 0.12);
}
body[data-ds-dark-theme] .dsh-notes-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
body[data-ds-dark-theme] .dsh-notes-item {
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45), 0 0 1px rgba(255, 255, 255, 0.12);
}
body[data-ds-dark-theme] .dsh-notes-item[data-active='true'] {
  background: rgba(255, 255, 255, 0.1);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.45),
    0 0 1px rgba(255, 255, 255, 0.14),
    inset 0 0 0 1px rgba(255, 255, 255, 0.16);
}

/* The excerpt carries weight rather than a tint: with the row's colour bar and
   the highlighted text in the transcript both already saying "quote", a third
   coloured block read as noise. */
/* 引文本身由 shell 的 QuotePreview 绘制（引用图标 + 业务色 + 单行省略 + 悬停全文），
   这里只让它在侧栏里占满可用宽度：组件默认给输入框留了 min(80%, 300px) 的上限。 */
.dsh-notes-quote {
  display: block;
  min-width: 0;
  padding: 1px 0 2px;
}
.dsh-notes-quote [data-quote-preview] {
  max-width: 100%;
}
.dsh-notes-note-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.dsh-notes-icon-button {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
}
.dsh-notes-icon-button:hover {
  background: rgba(38, 49, 72, 0.08);
  color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-notes-icon-button:hover {
  background: rgba(255, 255, 255, 0.1);
}
.dsh-notes-note {
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary, #6b7280);
  white-space: pre-wrap;
  border-radius: 4px;
  padding: 1px 3px;
  margin-left: -3px;
}
.dsh-notes-note[data-empty='true'] {
  opacity: 0.65;
  font-style: italic;
}
.dsh-notes-note-edit {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 4px;
  min-height: 48px;
  resize: vertical;
  font: inherit;
  font-size: 12px;
  line-height: 1.6;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-notes-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-notes-badge {
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 0 5px;
  font-size: 10px;
}
.dsh-notes-badge[data-status='exact'] { color: #047857; }
.dsh-notes-badge[data-status='fuzzy'] { color: #b45309; }
.dsh-notes-badge[data-status='lost'],
.dsh-notes-badge[data-status='missing'] { color: #b91c1c; }
.dsh-notes-hint {
  padding: 6px 12px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary, #6b7280);
  border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
}

.dsh-notes-panel-foot {
  display: flex;
  justify-content: flex-end;
  padding: 2px 0 8px;
  margin-top: auto;
  border-top: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
}
.dsh-notes-foot-note {
  margin-right: auto;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--dsw-alias-state-error-primary, #b91c1c);
}
.dsh-notes-foot-button {
  font: inherit;
  font-size: 11px;
  padding: 2px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #81858c);
  cursor: pointer;
  opacity: 0.8;
}
.dsh-notes-foot-button:hover {
  background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-primary, #1f2328);
  opacity: 1;
}
.dsh-notes-foot-button[data-on='true'] {
  color: var(--dsw-alias-brand-primary, #2563eb);
  opacity: 1;
}
.dsh-notes-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.dsh-notes-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  font: inherit;
  font-size: 12px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2328);
  cursor: pointer;
}
.dsh-notes-action:hover {
  background: rgba(38, 49, 72, 0.08);
}
body[data-ds-dark-theme] .dsh-notes-action:hover {
  background: rgba(255, 255, 255, 0.1);
}
/* Same shape as the app's open-with control: one hairline pill, a main
   action and a narrow chevron half split by a hairline. */
/* The shell's menu material is 58% opaque so it picks up whatever sits behind
   it. Inside this card that means a highlighted row tints the whole menu warm,
   while the same menu over plain text looks white. Pin our menus to the solid
   layer colour so all four read the same. */
.dsh-notes-menu-surface {
  --dsw-menu-surface-fill: var(--dsw-alias-bg-layer-2, #ffffff);
}

.dsh-notes-split {
  display: inline-flex;
  align-items: stretch;
  box-sizing: border-box;
  height: 24px;
  overflow: hidden;
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.15));
  border-radius: var(--dsw-radius-sm, 8px);
}
.dsh-notes-split-main,
.dsh-notes-split-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: none;
  color: var(--dsw-alias-label-primary, #1f2328);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-notes-split-main {
  gap: 4px;
  padding: 3px 5px;
}
.dsh-notes-split-chevron {
  padding: 3px 4px 3px 3px;
  border-left: 0.5px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.15));
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-notes-split-main:hover,
.dsh-notes-split-chevron:hover,
.dsh-notes-split-chevron[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-notes-split-slot {
  display: inline-flex;
}

.dsh-notes-more-slot {
  margin-left: auto;
  display: inline-flex;
}
.dsh-notes-more {
  height: 24px;
  min-width: 24px;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 0 6px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
}
.dsh-notes-more:hover {
  background: rgba(38, 49, 72, 0.08);
  color: var(--dsw-alias-label-primary, #1f2328);
}
body[data-ds-dark-theme] .dsh-notes-more:hover {
  background: rgba(255, 255, 255, 0.1);
}

.dsh-notes-composer {
  position: fixed;
  width: 300px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
  z-index: 40;
}
.dsh-notes-composer textarea {
  width: 100%;
  min-height: 64px;
  resize: vertical;
  box-sizing: border-box;
  font: inherit;
  font-size: 12.5px;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-notes-composer-row {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}
.dsh-notes-composer-row button {
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2328);
  cursor: pointer;
}
.dsh-notes-composer-row button[data-primary='true'] {
  background: var(--dsw-alias-button-primary-fill, #2563eb);
  border-color: var(--dsw-alias-button-primary-fill, #2563eb);
  color: var(--dsw-alias-label-primary-inverted, #ffffff);
  font-weight: 500;
}
.dsh-notes-composer-row button[data-primary='true']:hover {
  filter: brightness(1.05);
}


/* Settings section. Mirrors the shell's settings pages: 18px heading, 13px
   intro, hairline rows, 32px inputs and primitive buttons. */
.dsh-notes-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 760px;
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-notes-settings-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.dsh-notes-settings-intro,
.dsh-notes-settings-empty {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary, #9aa0a6);
}
.dsh-notes-preset {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr) auto;
  align-items: center;
  gap: 6px;
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.15));
  border-radius: var(--dsw-radius-lg, 12px);
  padding: 6px;
}
.dsh-notes-input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.15));
  border-radius: var(--dsw-radius-md, 10px);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-notes-input:focus {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary, #2563eb);
}
.dsh-notes-input::placeholder {
  color: var(--dsw-alias-label-dimmed, #b6bcc6);
}
.dsh-notes-input:disabled {
  opacity: 0.6;
  cursor: default;
}
.dsh-notes-settings-trash {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #9aa0a6);
  cursor: pointer;
}
.dsh-notes-settings-trash:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger, rgba(220, 38, 38, 0.08));
  color: var(--dsw-alias-state-error-primary, #dc2626);
}
.dsh-notes-settings-trash:disabled {
  cursor: default;
  opacity: 0.4;
}
.dsh-notes-settings-actions {
  display: flex;
  gap: 8px;
}
`
