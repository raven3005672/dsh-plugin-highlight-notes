# 架构

> 这里说"怎么搭起来的"；为什么这么选见 [`../DESIGN.md`](../DESIGN.md)，用户视角见 [`../README.md`](../README.md)。
> 对应当前版本 0.1.1，DSH `0.2.1-rc.2`。

## 一句话

插件在**回答**上加批注，并把引用送回输入框。全部逻辑跑在浏览器半边，只有"用户快捷键"这一项配置跨进程。

## 两半的分工

```
src/index.ts            宿主半边（Node）
  ├─ name = 'highlight-notes'
  ├─ Config: { presets?: {label, prompt}[] }   ← 唯一的跨进程数据
  └─ apply(): 空实现

src/client/index.tsx    浏览器半边（入口）
  ├─ 声明 inject = ['slots', 'locale', 'configForms']
  ├─ 注册 3 个槽位 + 注入样式表 + 注册语言字典
  └─ 把配置里的 presets 同步进 store
```

宿主半边**不注册任何东西**：它的存在只是为了声明 `Config`，让设置页有 schema 可读。批注数据从不经过它。

## 模块地图

| 文件 | 行数 | 职责 |
|---|---|---|
| `client/index.tsx` | 145 | 装配：槽位注册、样式注入、配置同步 |
| `client/store.ts` | 498 | 状态与副作用：批注读写、定位、绘制、面板开关、让位、诊断 |
| `client/anchor.ts` | 239 | 文本模型、选区描述、范围定位（纯函数 `resolveRange` 可单测） |
| `client/highlights.ts` | 51 | `CSS.highlights` 注册表：4 个静态名 |
| `client/AnnotationPanel.tsx` | 436 | 右侧面板：列表、筛选、快捷指令、几何测量 |
| `client/SelectionLayer.tsx` | 329 | 浮层：右键菜单、备注弹框 |
| `client/AnnotationPill.tsx` | 68 | 输入框上方的「批注 N」药丸 |
| `client/SettingsSection.tsx` | 58 | 设置分区外壳：自己订阅 `configForms` |
| `client/SettingsPage.tsx` | 189 | 设置页表单：快捷指令增删改、恢复内置、复制诊断 |
| `client/compose.ts` | 25 | 拼装「引用 → 备注 → 指令」 |
| `client/styles.ts` | 576 | 全部 CSS（一条字符串注入 `<style>`） |
| `client/contract.ts` | 111 | 共享类型，无运行时代码 |
| `client/locales.ts` | 112 | 中英字典；中文是键集真源 |

## 槽位注册

| 槽位 | 作用域 | 条目 id | 用途 |
|---|---|---|---|
| `conversation.composer.dock` | session | `highlight-notes.annotations` | 药丸；**唯一能拿到 `inputActions` 的地方** |
| `shell.overlay` | root | `highlight-notes.overlay` | 面板 + 右键菜单 + 备注弹框 |
| `settings.section` | root | `highlight-notes` | 设置页「批注」分区 |

药丸在 session 作用域、面板在 root 作用域，两者之间靠 `NotesStore` 单例桥接：药丸每次渲染把 `{sessionId, inputActions, draft, phase, occurrences}` 写进 store，面板从 store 读。

`ctx.slots.inject(name, () => register(...))` 用于等待槽位被声明；直接注册未声明的槽位会硬报错。

## 数据流

```
选中文字
  → describeSelection()：座位键 + 偏移 + 引文 + 32 字前后文
  → store.add() 写 localStorage
  → refresh()：定位 → 画高亮 → 更新 snapshot
  → 面板/药丸重渲染（订阅 store）

点「添加 / 解释」
  → composeMessage()（引用 → 备注 → 指令）
  → store.insertText()：草稿为空则 setDraft，否则 captureInsertion + insertText
  → 用户自己按发送
```

## 锚点算法

存的是**渲染后纯文本**里的偏移，不是 Markdown 源码偏移（源码里的 `**`、链接目标不会出现在 DOM 里）。

```
locate(annotation)
  1. resolveSeat: 先按 data-chat-flow-key（每个渲染座位唯一），失败再按 data-chat-node-key 取候选、
     选真正包含引文的那个
     —— 一个 node key 会同时出现在「思考过程」和「答案」两半上
  2. buildTextModel(seat): 拼接所有文本节点，记录每段起点
  3. resolveRange(text, quote, prefix, suffix, start):
       偏移命中 ⇒ exact
       否则扫描所有引文出现位置，按前后文重合长度打分
       单一候选，或得分 ≥ min(6, 上下文总长) ⇒ fuzzy
       否则 ⇒ lost
  4. rangeOf(model, start, end) 造 Range 交给 highlight 注册表
```

状态：`exact` / `fuzzy` / `lost`（找到了但造不出 Range）/ `missing`（座位不存在）。

## 绘制

CSS Custom Highlight API，**不往 Markdown DOM 里插节点**（插节点会打乱渲染器的 memo 化重排）。

```
dsh-notes-quote / dsh-notes-quote-active
dsh-notes-mark  / dsh-notes-mark-active
```

`::highlight()` 只接受静态名，所以颜色只能靠这几条静态规则，不能按批注动态生成。`CSS.highlights` 是文档级的，切会话必须显式清空。

## 存储

```jsonc
// localStorage["dsh-plugin-highlight-notes/v1/<sessionId>"]
[{ id, sessionId, kind: "quote"|"mark", nodeKey, flowKey,
   start, end, quote, prefix, suffix, note, createdAt }]
```

读取时统一过 `normalizeAnnotation()`：

- 未知字段**原样保留**（新版本写的数据降级后不会被抹掉）
- 未知的 `kind` 一律按 `quote` 读入（否则它会画不进任何注册表、又被所有筛选排除，下一次写入就消失）
- 缺 `id`/`nodeKey`/`start`/`end`/`quote` 的记录丢弃

## 面板几何

- 宽 260px，`right` 相对**对话区**（`[data-conversation-scroll]`）右缘，不是窗口——否则右侧边栏一开就飘到侧栏上
- 上边界：对话区顶部 + 8；下边界：**输入框卡片上沿** − 8（不是底部，否则会压住正在写的草稿）
- 让位：给滚动容器加 `padding-right`，值由**与 padding 无关的量**（滚动框 border-box 宽、列的 `max-width`）解出，且变化 < 1px 不写（见 DESIGN D17）
- 面板开着时隐藏对话区自带的宽度拖拽条：它锚在滚动框上，不随内容左移

## 设置

`settings.section` 只给 `close`，**不给 owner props**：

```ts
inject: () => ({
  form: ctx.configForms.get<{ presets?: Preset[] }>(SETTINGS_NAMESPACE),
  diagnostics: () => store.diagnosticsReport(),
})
```

所以 `SettingsSection.tsx` 自己订阅 form 并重渲染。`presets` 的三态：

| 存储层 | 含义 | 面板表现 |
|---|---|---|
| 无该字段 | 从未配置 | 内置两条（解释 / 不同意） |
| 有，且非空 | 用户自定义 | 用用户的 |
| 有，且为空 | 用户删光了 | 没有快捷指令，只剩「添加」 |

判定必须看**用户层有没有这个字段**：schema 会把未设置的数组解析成 `[]`，和"删光了"长得一样。

## 构建与发布

```
pnpm build   scripts/build.mjs (esbuild)
  src/index.ts        → lib/index.js     ESM, platform node22
  src/client/index.tsx → lib/client.js    CJS，包在 window.__ModuleLoader__.load({...}) 里
  外置：react / react/jsx-runtime / react-dom / react-dom/client /
        @deepseek-ai/dsh-client-ui-primitives（浏览器已注入，重复打包会破坏 hook 身份）

pnpm test    scripts/test.mjs        esbuild 现编 anchor.ts / store.ts，跑 17 条断言
pnpm smoke   scripts/smoke.mjs       无浏览器加载 bundle，断言槽位注册、语言字典、设置命名空间
pnpm verify  typecheck → test → build → smoke
pnpm release scripts/release.mjs    校验 → verify → 改版本 → 收口 CHANGELOG → commit → tag → push
```

推送 `v*` tag 触发 `.github/workflows/publish.yml`：OIDC 换取发布权限 → build/typecheck/test/smoke → `npm publish --provenance`。**发布只走 CI**，本地不 `npm publish`。

## 扩展点

| 想加什么 | 改哪里 |
|---|---|
| 一个内置快捷指令 | `locales.ts` 的 `preset.*` + `AnnotationPanel` 的内置数组 |
| 一种新的标注类型 | `contract.ts` 的 `AnnotationKind`、`highlights.ts` 注册表、`styles.ts` 的 `::highlight` 与 `data-kind` 配色、store 的分桶、面板筛选——**这是最贵的一种扩展** |
| 一个"重要"档（同色相加深） | `highlights.ts` 加一对注册名、`paint()` 改成按名字分桶、`styles.ts` 加规则 |
| 星标（不影响颜色） | `contract.ts` 加可选字段、`store.toggleStar`、面板行加图标——存储层天然兼容 |
| 换配色 | `styles.ts` 的 `::highlight()` 四条规则 + 行的 `--dsh-notes-accent` |

## 已知边界

- 数据只在 `localStorage`，不跨设备、不跨浏览器 profile
- 折叠起来的 reasoning / 工具输出里的文字不可标（展开后已有批注能重新定位）
- 选中跨段落时拒绝，不做自动拆分
- 实测规模：40 条批注 / 26 个渲染座位连续滚动，无 > 50ms 长任务；定位 + 两帧重绘 16ms
