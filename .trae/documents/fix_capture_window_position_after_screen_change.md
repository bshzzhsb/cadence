# 修复快速输入框在屏幕变化后定位偏移的方案

## Summary

目标：修复电脑物理屏幕变化后，通过快捷键、托盘或单实例唤起快速输入框时，窗口左右不居中、上下间距不符合预期的问题。

用户确认的行为：

- 唤起时按鼠标所在屏幕的可用工作区居中。
- 上下间距保持现有策略：顶部约为工作区高度的 18%，同时保证展开面板高度不溢出屏幕。
- 先只出方案，不修改业务代码。

## Current State Analysis

快速输入框是 Tauri `main` 窗口，前端输入框布局在 `src/app.tsx` 和 `src/app.css`，没有发现随屏幕变化改变居中逻辑的前端分支。偏移问题来自 Rust 侧原生窗口坐标。

关键代码在 `src-tauri/src/lib.rs`：

- `position_capture_window` 第 121-148 行：按 monitor work area、scale factor、`CAPTURE_WIDTH`、`CAPTURE_PANEL_HEIGHT` 计算窗口坐标。
- `resize_capture` 第 150-161 行：先读取 `outer_position()`，再 `set_size()`，最后把窗口恢复到旧位置。
- `show_capture` 第 164-180 行：快捷键、托盘、单实例唤起会先 `resize_capture(app, mode)`，然后 show/focus；这里没有重新计算位置。
- `capture_set_mode` 第 485-488 行：前端展开/收起面板只调用 `resize_capture`。
- `setup` 第 861-875 行：应用启动时只调用一次 `position_capture_window(&app.handle())`。

问题根因：

- 屏幕连接、断开、主屏变化、分辨率/缩放变化之后，隐藏的 `main` 窗口仍保留旧物理坐标。
- 后续唤起时 `resize_capture` 明确恢复旧坐标，导致旧坐标继续生效。
- 旧坐标在新的 monitor work area 下可能不再左右居中，顶部偏移也不再符合当前屏幕高度。

当前依赖可支持目标行为：

- 当前 Tauri 版本为 `tauri 2.11.5`。
- `WebviewWindow` 已暴露 `cursor_position()` 和 `monitor_from_point(x, y)`，可直接按鼠标物理坐标选择 monitor，不需要新增依赖。

## Proposed Changes

### 1. `src-tauri/src/lib.rs`：抽出纯定位计算函数

新增一个不依赖 Tauri runtime 的纯函数，例如：

- 输入：monitor work area 物理坐标与尺寸、scale factor。
- 输出：`PhysicalPosition<i32>` 或等价的 `(x, y)`。
- 计算规则保持现有逻辑：
  - `capture_width = round(CAPTURE_WIDTH * scale_factor)`。
  - `panel_height = round(CAPTURE_PANEL_HEIGHT * scale_factor)`。
  - `x = work_area.x + (work_area.width - capture_width).saturating_sub(0) / 2`。
  - `preferred_top = round(work_area.height * 0.18)`。
  - `max_top = work_area.height.saturating_sub(panel_height)`。
  - `y = work_area.y + min(preferred_top, max_top)`。

原因：把坐标算法从窗口 API 中拆出后，可以用 Rust 单元测试覆盖不同屏幕尺寸、缩放和负坐标 monitor，不需要依赖真实多屏环境。

### 2. `src-tauri/src/lib.rs`：按鼠标所在屏选择 monitor

调整 `position_capture_window` 的 monitor 选择逻辑：

1. 获取 `main` 窗口。
2. 优先调用 `window.cursor_position()` 取得当前鼠标物理坐标。
3. 用 `window.monitor_from_point(cursor.x, cursor.y)` 找到鼠标所在 monitor。
4. 如果鼠标位置获取失败或找不到 monitor，回退到 `window.current_monitor()`。
5. 如果仍失败，回退到 `window.primary_monitor()`。
6. 用选中的 monitor 的 `work_area()` 和 `scale_factor()` 计算并 `set_position()`。

原因：用户期望唤起时跟随鼠标所在屏；屏幕变化后，窗口旧坐标不可信，因此不能继续把 `current_monitor()` 作为首选。

### 3. `src-tauri/src/lib.rs`：唤起/切换模式后重新定位

调整 `resize_capture` 和调用点，避免保存并恢复旧坐标：

- `resize_capture(app, mode)` 只负责 `set_size(capture_size(mode)?)`。
- `show_capture(app, mode)` 在 `resize_capture` 后立即调用 `position_capture_window(app)`，再 show/unminimize/focus/emit。
- `capture_set_mode(app, mode)` 在 `resize_capture` 后也调用 `position_capture_window(&app)`，保证展开/收起面板时仍使用当前鼠标所在屏和当前 work area。
- `capture_hide(app)` 可以继续把窗口恢复为 compact 尺寸；是否重新定位不影响隐藏态，但为保证下次状态一致，可在 resize 后不定位，等下一次 show 时定位。

原因：每次可见展示或可见尺寸变化都重新计算坐标，屏幕变化后的旧坐标不会继续污染下一次唤起。

### 4. `src-tauri/src/lib.rs`：保留启动定位

保留 `setup` 中的 `position_capture_window(&app.handle())`。

原因：启动后窗口配置仍是 `center: false`，需要初始化位置；新的 `position_capture_window` 会优先鼠标所在屏，启动时若鼠标位置不可用会自然回退到当前/主屏。

### 5. `src-tauri/src/lib.rs`：补充 Rust 单元测试

在现有 `#[cfg(test)] mod tests` 中补充纯计算函数测试：

- `centers_capture_window_horizontally_in_work_area`：验证 1x 缩放下 x 居中。
- `uses_scale_factor_for_physical_capture_width`：验证 2x/1.5x 缩放下宽度换算正确。
- `keeps_panel_within_short_work_area`：验证工作区高度不足时 y 使用 `max_top`，展开面板不溢出。
- `supports_negative_monitor_origins`：验证左侧/上方副屏的负坐标 origin 可以正确叠加。

不需要新增前端测试，因为修复点在原生窗口坐标计算，前端 DOM 布局没有变化。

## Assumptions & Decisions

- 判定为 Rust/Tauri 原生窗口定位问题，不修改 `src/app.tsx`、`src/app.css`。
- 多屏策略按用户选择：优先鼠标所在屏。
- 顶部间距策略保持现有产品行为，不做视觉比例重设计。
- 不新增依赖；使用当前 Tauri 2.11.5 已提供的 `cursor_position()` 与 `monitor_from_point()`。
- 回退链必须保留，避免某些平台或权限场景下无法获取鼠标坐标导致窗口无法唤起。
- 不引入屏幕变化事件监听；原因是按唤起/模式切换即时重算即可覆盖用户可见场景，改动更小，风险更低。

## Verification Steps

实现后执行：

1. `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
2. `cargo test --manifest-path src-tauri/Cargo.toml`
3. `pnpm build`

手工验证：

1. 启动 `pnpm tauri dev`。
2. 单屏下用 `CommandOrControl+Shift+Space` 唤起，确认快速输入框在鼠标所在屏左右居中，顶部间距仍接近原策略。
3. 连接外接显示器，把鼠标移到外接屏后唤起，确认窗口出现在外接屏并居中。
4. 把鼠标移回内置屏后唤起，确认窗口出现在内置屏并居中。
5. 断开外接屏后再次唤起，确认不会保留旧外接屏坐标。
6. 展开任务面板和收起面板，确认窗口仍按当前鼠标所在屏重算位置，面板不溢出当前屏幕工作区。
