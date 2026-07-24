# 文案管理方案计划

## Summary

本次目标是建立一套轻量的文案管理方案，避免前后端运行时代码在使用处直接写用户可见文案。方案不引入 i18n 依赖，不做多语言运行时切换；通过前端 `src/lib/copy.ts` 和 Rust `src-tauri/src/copy.rs` 分别集中管理运行时文案，并在组件、工具函数、窗口创建、托盘菜单、通知和用户可见错误里引用这些常量或格式化函数。

范围覆盖：

* React UI 文案：按钮、标题、空状态、toast、placeholder、aria-label、title、截图/识别/设置窗口文案。

* 前端工具函数中直接返回给用户的文本，例如日期显示里的“未安排”“今天”。

* Rust 运行时用户可见文案：窗口标题、托盘菜单、系统通知标题/正文、返回给前端展示的错误提示。

* 现有测试中依赖用户可见文案的查询文本。

明确不覆盖：

* `src-tauri/tauri.conf.json` 中的 `productName` 和默认主窗口 `title`，按用户确认保留为配置元数据。

* AI prompt、飞书字段名、解析关键词、测试夹具里的任务标题、日志类 `eprintln!` 文本。

* `toLocaleString("zh-CN")`、`toLocaleDateString("zh-CN")` 这类格式化 locale 参数；它们是格式规则，不是可编辑文案。

## Current State Analysis

前端目前没有统一 copy 层，用户可见文案散落在以下位置：

* `src/app.tsx`

  * 顶部 tab：未来、历史、周总结。

  * 识别错误、剪贴板提示、placeholder、输入框 aria-label、按钮 title/aria-label、任务面板和分类 aria-label。

  * 任务操作成功提示：任务已完成、任务已重新打开、任务已删除。

  * 空状态、任务分组标题、周总结按钮和空状态。

  * 多处动态拼接：`识别失败：${payload}`、剪贴板预览、展开/收起任务面板、周总结报告类型。

* `src/main.tsx`

  * 非 Tauri 环境提示：请使用 Cadence 桌面版、说明文本。

* `src/biz-components/settings-window.tsx`

  * 设置页 tab、字段 label、option、placeholder、按钮、toast、aria-label。

* `src/biz-components/task-item.tsx`

  * 任务操作 aria-label、高优先级、逾期前缀、删除/重新打开。

* `src/biz-components/draft-review.tsx`

  * 智能识别弹窗标题、说明、badge、选择计数、按钮、动态创建数量。

* `src/biz-components/screenshot-selection-window.tsx`

  * 截图选择窗口 aria-label、提示、选择尺寸、取消/识别按钮、提交状态。

* `src/biz-components/screenshot-cropper.tsx`

  * 截图裁剪弹窗标题、说明、alt、按钮、识别状态。

* `src/lib/utils.ts`

  * `formatDue` 直接返回“未安排”和“今天 ...”。

Rust 运行时用户可见文案集中在 `src-tauri/src/lib.rs`，但仍写在使用处：

* 错误提示：截图选区无效、选区太小、找不到快速记录窗口、未找到主显示器、未知窗口模式等。

* 窗口标题：`Cadence 设置`、`Cadence 截图识别`、识别结果/失败窗口标题。

* 系统通知：`Cadence 已识别任务`、`Cadence 识别失败`、`Cadence · 即将到期`。

* 托盘菜单：快速记录、打开任务清单、设置、退出 Cadence、tooltip。

* 识别结果摘要：未设置日期、高/低/普通优先级、已识别并添加 N 项任务、其余任务已添加。

Rust 的 `src-tauri/src/integrations.rs` 和 `src-tauri/src/db.rs` 也有中文字符串，但多数属于 AI prompt、飞书字段名、Markdown 报告模板或后端集成协议文本。本次不纳入第一轮迁移，避免把“产品界面文案”和“外部协议/模型提示词”混成一个模块。

## Proposed Changes

### 1. 新增前端文案模块 `src/lib/copy.ts`

新增 `src/lib/copy.ts`，导出 `APP_COPY` 常量对象和少量格式化函数。采用语义化英文 key，值保持当前中文文案。

建议结构：

```ts
export const APP_COPY = {
  app: {
    name: "Cadence",
  },
  desktopOnly: {
    title: "请使用 Cadence 桌面版",
    body: "Cadence 的任务、设置和模型配置需要在 Tauri 桌面应用中运行。",
  },
  capture: {
    tabs: {
      future: "未来",
      history: "历史",
      weekly: "周总结",
    },
    placeholder: {
      default: "写下任务，例如：明天下午 3 点交方案 #工作 !高",
      clipboardImage: "已读取剪贴板图片，点击“识别”发送给模型",
      clipboardText: (content: string) => `剪贴板：${content.replace(/\s+/g, " ").trim().slice(0, 96)}${content.length > 96 ? "…" : ""}`,
    },
    toast: {
      recognitionFailed: (message: string) => `识别失败：${message}`,
      clipboardImageReady: "已读取剪贴板图片，点击“识别”发送给模型",
      clipboardTextReady: "已读取剪贴板内容，点击“识别”发送给模型",
      taskCompleted: "任务已完成",
      taskReopened: "任务已重新打开",
      taskDeleted: "任务已删除",
      weeklyGenerated: "周总结已生成",
    },
    actions: {
      quickAdd: "快速添加任务",
      addTask: "添加任务",
      processing: "正在处理",
      confirmClipboardRecognition: "确认识别剪贴板内容",
      recognize: "识别",
      readClipboard: "读取剪贴板内容",
      captureScreen: "框选屏幕区域识别",
      expandPanel: "展开任务面板",
      collapsePanel: "收起任务面板",
    },
    panel: {
      label: "任务面板",
      tabsLabel: "任务分类",
      historyTitle: "已完成",
      historyEmptyTitle: "还没有完成记录",
      historyEmptyText: "完成的任务会留在这里，方便回顾。",
      futureEmptyTitle: "接下来很清爽",
      futureEmptyText: "用上方输入框记下一件事，回车即可保存。",
      overdue: "逾期",
      today: "今天",
      later: "以后",
      unscheduled: "待安排",
    },
    weekly: {
      intro: "回顾完成过的事，也为下一周留出空间。",
      generateData: "生成数据版",
      generateAi: "AI 总结",
      emptyList: "还没有周总结。",
      aiReport: "AI 版",
      dataReport: "数据版",
      emptyTitle: "生成第一份周总结",
      emptyText: "Cadence 会根据本地任务历史整理完成情况与下周重点。",
    },
  },
  taskItem: {
    completeTask: (title: string) => `完成 ${title}`,
    reopenTaskWithTitle: (title: string) => `重新打开 ${title}`,
    reopen: "重新打开",
    delete: "删除任务",
    overduePrefix: "已逾期 · ",
    highPriority: "高优先级",
  },
  due: {
    unscheduled: "未安排",
    todayPrefix: "今天",
  },
  // settings, draftReview, screenshotSelection, screenshotCropper 同样按组件域分组。
} as const;
```

实施细节：

* 不使用 React Context 或 hook，避免简单文案访问引入运行时层级。

* 动态文案使用函数，函数放在 copy 对象里，调用方只传业务变量。

* 继续允许用户数据、接口返回错误、任务标题、tag 名称在使用处展示；这些不是静态文案。

* 如果文案既作为可见文本又作为 `aria-label` 或 `title`，复用同一个 key。

### 2. 更新前端使用点

按文件迁移：

* `src/main.tsx`

  * 导入 `APP_COPY`。

  * 替换桌面版提示中的 `Cadence`、标题和说明。

* `src/app.tsx`

  * 导入 `APP_COPY`。

  * `tabs` 的 `label` 改为来自 `APP_COPY.capture.tabs`。

  * `announce` 入参保持字符串，但所有调用点改为 copy 常量或函数。

  * `capturePlaceholder` 改为使用 `APP_COPY.capture.placeholder.*`。

  * 替换 input/button/section/nav 的 `aria-label`、`title` 和可见按钮文本。

  * `FutureTasks`、`TaskCollection`、`WeeklyPanel` 的传入标题和空状态改为 copy。

  * 周总结报告类型从 `APP_COPY.capture.weekly.aiReport` / `dataReport` 获取。

* `src/biz-components/settings-window.tsx`

  * 新增 `settings` copy 分组，包含 tabs、heading、tablist aria、字段 label、options、placeholder、连接按钮、toast。

  * `settingsTabs` 仍保留组件内的 icon/结构逻辑，但 label/description 来自 copy。

* `src/biz-components/task-item.tsx`

  * 使用 `APP_COPY.taskItem.completeTask(task.title)`、`reopenTaskWithTitle(task.title)`、`highPriority`、`overduePrefix`、`delete`、`reopen`。

* `src/biz-components/draft-review.tsx`

  * 新增 `draftReview` copy 分组，包含 heading、说明、关闭、需要确认、已选择计数、取消、保存中、创建数量。

* `src/biz-components/screenshot-selection-window.tsx`

  * 新增 `screenshotSelection` copy 分组，包含窗口 label、拖动提示、按 Esc 取消、已选择尺寸、取消、提交中、识别选区。

* `src/biz-components/screenshot-cropper.tsx`

  * 新增 `screenshotCropper` copy 分组，包含弹窗 aria、标题、说明、关闭截图、图片 alt、取消、识别中、识别选中区域。

* `src/lib/utils.ts`

  * 导入 `APP_COPY`。

  * `formatDue` 的“未安排”和“今天”前缀从 `APP_COPY.due` 获取。

### 3. 新增 Rust 文案模块 `src-tauri/src/copy.rs`

新增 `src-tauri/src/copy.rs`，集中管理 `src-tauri/src/lib.rs` 中运行时用户可见文案。

建议内容：

```rust
pub const APP_NAME: &str = "Cadence";
pub const SETTINGS_WINDOW_TITLE: &str = "Cadence 设置";
pub const SCREENSHOT_WINDOW_TITLE: &str = "Cadence 截图识别";
pub const RECOGNIZED_TASKS_WINDOW_TITLE: &str = "Cadence 已识别任务";
pub const RECOGNITION_FAILED_WINDOW_TITLE: &str = "Cadence 识别失败";
pub const DUE_SOON_NOTIFICATION_TITLE: &str = "Cadence · 即将到期";

pub const TRAY_QUICK_CAPTURE: &str = "快速记录";
pub const TRAY_OPEN_TASK_PANEL: &str = "打开任务清单";
pub const TRAY_SETTINGS: &str = "设置";
pub const TRAY_QUIT: &str = "退出 Cadence";

pub const ERR_INVALID_SCREENSHOT_SELECTION: &str = "截图选区无效，请重新框选";
pub const ERR_SCREENSHOT_SELECTION_TOO_SMALL: &str = "选区太小，请重新框选";
pub const ERR_CAPTURE_WINDOW_NOT_FOUND: &str = "找不到快速记录窗口";
pub const ERR_PRIMARY_MONITOR_NOT_FOUND: &str = "未找到主显示器";
pub const ERR_UNKNOWN_WINDOW_MODE: &str = "未知的窗口模式";
pub const ERR_NO_RECOGNIZED_TASKS: &str = "没有识别到可创建的任务";

pub const RECOGNITION_NO_DUE_DATE: &str = "未设置日期";
pub const PRIORITY_HIGH: &str = "高优先级";
pub const PRIORITY_LOW: &str = "低优先级";
pub const PRIORITY_NORMAL: &str = "普通优先级";
pub const RECOGNITION_REMAINDER: &str = "；其余任务已添加";

pub fn recognition_summary(count: usize, details: &str, remainder: &str) -> String {
    format!("已识别并添加 {} 项任务：{}{}", count, details, remainder)
}

pub fn screenshot_focus_cleanup_failed(error: &str, cleanup_error: &str) -> String {
    format!("截图窗口无法获得焦点：{}；清理截图窗口失败：{}", error, cleanup_error)
}
```

实施细节：

* 在 `src-tauri/src/lib.rs` 顶部添加 `mod copy;`。

* 将用户可见的常量和动态错误格式化切到 `copy` 模块。

* 保持内部 label、menu id、window label 等程序标识不迁移，例如 `CAPTURE_WINDOW_LABEL = "main"`、`SETTINGS_WINDOW_LABEL = "settings"`。

* `eprintln!` 日志不是主要用户可见面，不作为本轮强制迁移目标；如果它复用了同一错误字符串，可自然引用 copy 函数。

* `src-tauri/src/integrations.rs` 和 `src-tauri/src/db.rs` 暂不迁移，后续如要治理 AI prompt、飞书字段名或报告模板，应单独建 `prompts.rs`、`lark_schema.rs`、`report_templates.rs`，不要塞进 `copy.rs`。

### 4. 更新 Rust 使用点

按 `src-tauri/src/lib.rs` 内功能区替换：

* `normalize_screenshot_selection`

  * 替换截图选区无效、选区太小。

* `screenshot_region`、`resize_capture`、`show_capture`、`open_screenshot_selection`

  * 替换找不到快速记录窗口、未找到主显示器。

* `capture_size`

  * 替换未知窗口模式。

* `open_settings`

  * 窗口标题使用 `copy::SETTINGS_WINDOW_TITLE`。

* `open_screenshot_selection`

  * 窗口标题使用 `copy::SCREENSHOT_WINDOW_TITLE`，焦点/清理失败用 copy 格式化函数。

* `destroy_screenshot_selection`、`hide_screenshot_selection`

  * 失败组合信息用 copy 格式化函数。

* `recognition_summary`

  * 未设置日期、优先级 label、其余任务文案、总摘要文案来自 `copy`。

* `save_recognized_tasks`

  * 空结果错误、通知标题来自 `copy`。

* `report_recognition_error`

  * 通知标题来自 `copy`。

* `setup_tray`

  * 托盘菜单和 tooltip 来自 `copy`。

* `spawn_reminder_worker`

  * 到期通知标题来自 `copy`。

### 5. 更新测试

更新现有测试，不新增无意义的结构测试。

* `src/app.test.tsx`

  * 导入 `APP_COPY`。

  * 用 `APP_COPY.capture.actions.expandPanel`、`APP_COPY.capture.panel.label`、`APP_COPY.capture.actions.readClipboard`、`APP_COPY.capture.actions.quickAdd`、`APP_COPY.capture.actions.confirmClipboardRecognition` 替换直接查询文案。

  * 测试夹具任务标题如“十天后的任务”“已完成任务”保留为业务数据。

* `src/biz-components/settings-window.test.tsx`

  * 导入 `APP_COPY`。

  * 用 `APP_COPY.settings.tabs.ai.label`、`APP_COPY.settings.fields.aiBaseUrl.label`、`APP_COPY.settings.fields.aiTextModel.label`、`APP_COPY.settings.fields.aiVisionModel.label`、`APP_COPY.settings.fields.aiKey.label`、`APP_COPY.settings.actions.save` 替换查询文案。

* `src/biz-components/screenshot-selection-window.test.tsx`

  * 导入 `APP_COPY`。

  * 用 `APP_COPY.screenshotSelection.actions.recognizeSelection` 替换按钮查询文案。

  * 模拟错误 `new Error("截图失败")` 保留为接口错误数据。

## Assumptions & Decisions

* 已确认管理范围是“前后端用户可见文案”。

* 已确认方案形态是“不引入依赖的轻量常量表”。

* 已确认 `src-tauri/tauri.conf.json` 的 `productName` 和主窗口默认 `title` 保留在配置里，不纳入统一文案源。

* 前端和 Rust 分别维护本地文案模块，不尝试跨语言共享同一个 JSON 源，避免构建链路复杂化。

* 不将 AI prompt、飞书字段名、解析关键词、报告模板纳入 `copy` 模块；这些属于协议、模型或模板资产，应后续独立治理。

* 不把用户输入、任务标题、tag、接口返回错误原文当作文案迁移。

* 文案 key 使用英文语义命名，符合当前 TypeScript/Rust 代码风格；中文只出现在 copy 模块或测试业务夹具中。

## Verification Steps

实施后执行：

1. 前端单测：

   ```bash
   pnpm test
   ```

2. 前端类型检查和构建：

   ```bash
   pnpm build
   ```

3. Rust 单测：

   ```bash
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

4. Rust 格式检查：

   ```bash
   cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
   ```

5. 完整 Tauri 快速构建校验：

   ```bash
   pnpm tauri build --debug --no-bundle
   ```

6. 文案散落检查：

   ```bash
   rg -n "[\\u4e00-\\u9fff]" src --glob '!src/lib/copy.ts' --glob '!**/*.test.ts' --glob '!**/*.test.tsx'
   rg -n "[\\u4e00-\\u9fff]" src-tauri/src/lib.rs
   ```

   预期：

   * 前端命令不再命中组件使用处的静态 UI 文案；若有命中，应只是不属于文案治理范围的 locale 参数或用户数据示例。

   * Rust `src-tauri/src/lib.rs` 不再直接包含本轮范围内的用户可见中文文案。

## Acceptance Criteria

* 新增 `src/lib/copy.ts`，前端运行时静态文案集中在该文件。

* 新增 `src-tauri/src/copy.rs`，Rust 运行时用户可见文案集中在该文件。

* React 组件和 `src/lib/utils.ts` 不再在使用处直接写本轮范围内的用户可见文案。

* `src-tauri/src/lib.rs` 不再在使用处直接写本轮范围内的用户可见文案。

* 现有用户界面文字、按钮可访问名称、toast、通知、窗口标题和托盘菜单行为保持不变。

* 测试通过，且文案散落检查结果符合预期。

