# Cadence

Cadence 是一款 Windows/macOS 本地优先个人任务工具：用最短路径记录任务、接收 DDL 提醒、从剪贴板或屏幕提取行动项，并生成周总结。

## 当前功能

- 默认以 Spotlight 风格的紧凑快速记录窗运行；`Ctrl/Cmd + Shift + Space`、单实例唤起和托盘左键都会显示并聚焦它。
- 点击展开按钮后，在同一窄窗口中查看“未来”“历史”“周总结”；“未来”按逾期、今天、未来 7 天、以后和待安排分组。
- 托盘菜单提供快速记录、任务清单、独立设置窗口和退出入口；快速记录窗关闭、按 Esc 或失焦时隐藏到托盘。
- 手动输入、剪贴板文本/图片和截图识别都会在后台调用模型；提交后可立即继续记录，识别完成或失败会通过系统通知反馈。
- 截图使用透明实时框选层：先框选区域，再在后台截取、裁剪并识别，避免等待整屏截图阻塞界面。
- 模型会结构化提取任务标题、日期时间、优先级和标签；创建成功后自动写入 SQLite，并发送原生提醒。
- SQLite 本地持久化、任务事件记录，以及 DDL 前 24 小时和 1 小时提醒。
- 数据版周总结、可选 AI 增强，以及按设定时间自动生成。
- 飞书 OAuth、Base 单向增量同步与周总结追加到 Docx 文档。
- 系统深浅色、键盘焦点和屏幕阅读器状态播报。

## 前端目录

- `src/components/`：无业务语义的基础组件，例如 `button`、`input`、`badge`。
- `src/biz-components/`：任务、设置、截图、识别等业务组件，例如 `task-item`、`settings-window`、`screenshot-selection-window`。
- `src/lib/`：不渲染 UI 的共享逻辑。`api.ts` 负责 Tauri 桥接，`types.ts` 定义数据契约，`utils.ts` 提供通用函数，`task-groups.ts` 提供纯任务分组逻辑。

React 源文件、样式文件和测试文件使用 kebab-case，例如 `task-item.tsx`、`screenshot-selection-window.test.tsx`。组件导出仍使用 `PascalCase`。

## 开发

要求：Node.js 24+、pnpm 11+、Rust stable，以及 [Tauri 平台依赖](https://v2.tauri.app/start/prerequisites/)。项目使用本地依赖的 TypeScript 7.0.2，无需全局安装 TypeScript。

```powershell
pnpm install
pnpm test
pnpm build
pnpm tauri dev
```

快速验证完整桌面构建：

```powershell
pnpm tauri build --debug --no-bundle
```

Windows 安装包：

```powershell
pnpm tauri build --bundles nsis
```

macOS 安装包需在 macOS 上构建：

```bash
pnpm tauri build --bundles dmg
```

## AI 配置

打开 Cadence 的“设置”窗口，在“AI 服务”中填写：

- 服务地址：兼容 OpenAI `chat/completions` 协议的服务地址，例如 `https://your-ai-service.example/v1`。
- API Key：输入后保存在系统密钥库，留空表示不修改已有值。
- 文本模型和视觉模型：可以分别配置，默认均为 `mimo-v2.5`。

服务地址、模型名和其他用户设置保存在本地 SQLite；API Key 不写入数据库。

按 Enter 创建手动任务、确认剪贴板识别或提交截图选区，即表示允许本次模型识别。模型识别在后台进行，成功后自动创建任务；失败时不会写入任务，并会显示失败通知。

## 数据与隐私

- 数据库位于系统应用数据目录中的 `cadence.sqlite3`。
- 模型服务地址、模型名和其他用户设置写入 SQLite；模型 API Key、飞书 App Secret 和 OAuth token 存入系统凭证库。
- 不持续监听剪贴板，不保存原始截图，不包含遥测。
- 截图仅在内存中截取和裁剪选区后发送给模型，不写入本地文件。
- 未配置飞书时，本地任务、提醒和数据版周总结仍可使用；需要模型识别时必须在设置窗口完成模型配置。

## 飞书配置

1. 在飞书开放平台创建自建应用，开通多维表格与新版文档的读写权限。
2. 将 `http://127.0.0.1:34115/oauth/feishu/callback` 加入应用的 OAuth 重定向 URL。
3. 在 Cadence 的独立设置窗口填写 App ID、App Secret，以及目标 Base 链接；Base 链接需要包含当前数据表的 `table` 参数。
4. 如需同步周总结，填写 `/docx/` 类型的飞书文档链接；Wiki 链接需先打开其对应的 Docx 文档再复制链接。
5. 点击“保存并连接飞书”完成授权，然后从任务面板执行同步。

任务同步是单向的：Cadence 是事实来源。程序会自动补齐 Base 字段，并依据 `Cadence ID` 新增或更新记录；本地删除会在远端记录中标记为 `deleted`，不会物理删除飞书数据。

## 当前边界

- 截图仅支持主屏；框选时显示的是透明实时覆盖层，而不是预先缓存的完整屏幕图像。
- 模型调用采用 OpenAI-compatible `chat/completions` 协议；文本模型和视觉模型可在设置窗口分别配置，默认使用 `mimo-v2.5`。
- 飞书资源由用户预先创建；MVP 不自动新建 Base 或文档，也不从飞书反向覆盖本地任务。
- macOS 安装包必须在 macOS 主机签名与构建；当前仓库已配置 DMG 目标，但本机只验证 Windows 构建。
- Cadence 仅支持 Tauri 桌面运行；直接在浏览器打开开发页面时会显示桌面版提示。
