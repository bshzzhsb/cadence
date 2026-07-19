mod db;
mod integrations;
mod models;
mod parser;

use chrono::{Datelike, Local, Timelike};
use db::Database;
use models::{
    AppSettings, CreateTaskInput, SecretUpdates, SyncStatus, Task, TaskDraft, WeeklyReport,
};
use std::{sync::Arc, time::Duration};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, State, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;

struct AppState {
    db: Arc<Database>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScreenshotSelection {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ScreenshotRegion {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

const CAPTURE_WINDOW_LABEL: &str = "main";
const SETTINGS_WINDOW_LABEL: &str = "settings";
const SCREENSHOT_SELECTION_WINDOW_LABEL: &str = "screenshot-selection";
const CAPTURE_WIDTH: f64 = 680.0;
const CAPTURE_COMPACT_HEIGHT: f64 = 60.0;
const CAPTURE_PANEL_HEIGHT: f64 = 720.0;

fn normalize_screenshot_selection(
    selection: &ScreenshotSelection,
    scale_factor: f64,
    physical_width: u32,
    physical_height: u32,
) -> Result<ScreenshotRegion, String> {
    if !scale_factor.is_finite()
        || scale_factor <= 0.0
        || !selection.x.is_finite()
        || !selection.y.is_finite()
        || !selection.width.is_finite()
        || !selection.height.is_finite()
        || selection.x < 0.0
        || selection.y < 0.0
        || selection.width <= 0.0
        || selection.height <= 0.0
    {
        return Err("截图选区无效，请重新框选".into());
    }

    let left = (selection.x * scale_factor)
        .floor()
        .clamp(0.0, physical_width as f64) as u32;
    let top = (selection.y * scale_factor)
        .floor()
        .clamp(0.0, physical_height as f64) as u32;
    let right = ((selection.x + selection.width) * scale_factor)
        .ceil()
        .clamp(0.0, physical_width as f64) as u32;
    let bottom = ((selection.y + selection.height) * scale_factor)
        .ceil()
        .clamp(0.0, physical_height as f64) as u32;
    let width = right.saturating_sub(left);
    let height = bottom.saturating_sub(top);
    if width < 8 || height < 8 {
        return Err("选区太小，请重新框选".into());
    }

    Ok(ScreenshotRegion {
        x: left,
        y: top,
        width,
        height,
    })
}

fn screenshot_region(
    app: &AppHandle,
    selection: &ScreenshotSelection,
) -> Result<ScreenshotRegion, String> {
    let main = app
        .get_webview_window(CAPTURE_WINDOW_LABEL)
        .ok_or_else(|| "找不到快速记录窗口".to_string())?;
    let monitor = main
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "未找到主显示器".to_string())?;
    let size = monitor.size();
    normalize_screenshot_selection(selection, monitor.scale_factor(), size.width, size.height)
}

fn capture_size(mode: &str) -> Result<LogicalSize<f64>, String> {
    match mode {
        "compact" => Ok(LogicalSize::new(CAPTURE_WIDTH, CAPTURE_COMPACT_HEIGHT)),
        "panel" => Ok(LogicalSize::new(CAPTURE_WIDTH, CAPTURE_PANEL_HEIGHT)),
        _ => Err("未知的窗口模式".into()),
    }
}

fn position_capture_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(CAPTURE_WINDOW_LABEL) else {
        return;
    };
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };

    let work_area = monitor.work_area();
    let scale_factor = monitor.scale_factor();
    let capture_width = (CAPTURE_WIDTH * scale_factor).round() as u32;
    let panel_height = (CAPTURE_PANEL_HEIGHT * scale_factor).round() as u32;
    let horizontal_offset = work_area.size.width.saturating_sub(capture_width) / 2;
    let preferred_top_offset = (work_area.size.height as f64 * 0.18).round() as u32;
    let max_top_offset = work_area.size.height.saturating_sub(panel_height);
    let vertical_offset = preferred_top_offset.min(max_top_offset);

    let position = PhysicalPosition::new(
        work_area.position.x + horizontal_offset as i32,
        work_area.position.y + vertical_offset as i32,
    );
    let _ = window.set_position(position);
}

fn resize_capture(app: &AppHandle, mode: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(CAPTURE_WINDOW_LABEL)
        .ok_or_else(|| "找不到快速记录窗口".to_string())?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    window
        .set_size(capture_size(mode)?)
        .map_err(|error| error.to_string())?;
    window
        .set_position(position)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn show_capture(app: &AppHandle, mode: &str) -> Result<(), String> {
    // Showing the capture window is also the native escape hatch from the
    // full-screen screenshot window. Keep this cleanup here so tray actions,
    // the global shortcut, and error recovery all behave consistently.
    hide_screenshot_selection(app)?;
    resize_capture(app, mode)?;
    let window = app
        .get_webview_window(CAPTURE_WINDOW_LABEL)
        .ok_or_else(|| "找不到快速记录窗口".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    let _ = window.emit("capture:mode", mode);
    if mode == "compact" {
        let _ = window.eval("document.getElementById('quick-capture')?.focus()");
    }
    Ok(())
}

fn try_show_capture(app: &AppHandle, mode: &str) {
    if let Err(error) = show_capture(app, mode) {
        eprintln!("无法显示快速记录窗口：{}", error);
    }
}

fn open_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }

    let handle = app.clone();
    std::thread::spawn(move || {
        if let Ok(window) = WebviewWindowBuilder::new(
            &handle,
            SETTINGS_WINDOW_LABEL,
            WebviewUrl::App("index.html?window=settings".into()),
        )
        .title("Cadence 设置")
        .inner_size(900.0, 720.0)
        .min_inner_size(720.0, 560.0)
        .build()
        {
            let _ = window.set_focus();
        }
    });
}

fn open_screenshot_selection(app: &AppHandle) -> Result<(), String> {
    destroy_screenshot_selection(app)?;

    let main = app
        .get_webview_window(CAPTURE_WINDOW_LABEL)
        .ok_or_else(|| "找不到快速记录窗口".to_string())?;
    let monitor = main
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "未找到主显示器".to_string())?;
    let scale_factor = monitor.scale_factor();
    let position = monitor.position();
    let size = monitor.size();

    let window = WebviewWindowBuilder::new(
        app,
        SCREENSHOT_SELECTION_WINDOW_LABEL,
        WebviewUrl::App("index.html?window=screenshot".into()),
    )
    .title("Cadence 截图识别")
    .position(
        position.x as f64 / scale_factor,
        position.y as f64 / scale_factor,
    )
    .inner_size(
        size.width as f64 / scale_factor,
        size.height as f64 / scale_factor,
    )
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;
    if let Err(error) = window.show().and_then(|_| window.set_focus()) {
        let cleanup = window
            .destroy()
            .map_err(|cleanup_error| cleanup_error.to_string());
        return match cleanup {
            Ok(()) => Err(error.to_string()),
            Err(cleanup_error) => Err(format!(
                "截图窗口无法获得焦点：{}；清理截图窗口失败：{}",
                error, cleanup_error
            )),
        };
    }
    Ok(())
}

fn destroy_screenshot_selection(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SCREENSHOT_SELECTION_WINDOW_LABEL) {
        if let Err(destroy_error) = window.destroy() {
            return match window.hide() {
                Ok(()) => Err(format!(
                    "销毁截图窗口失败：{}；已隐藏截图窗口，暂不能重新创建",
                    destroy_error
                )),
                Err(hide_error) => Err(format!(
                    "销毁截图窗口失败：{}；隐藏截图窗口也失败：{}",
                    destroy_error, hide_error
                )),
            };
        }
    }
    Ok(())
}

fn hide_screenshot_selection(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SCREENSHOT_SELECTION_WINDOW_LABEL) {
        if let Err(hide_error) = window.hide() {
            window.destroy().map_err(|destroy_error| {
                format!(
                    "隐藏截图窗口失败：{}；销毁截图窗口也失败：{}",
                    hide_error, destroy_error
                )
            })?;
        }
    }
    Ok(())
}

fn dismiss_screenshot_selection(app: &AppHandle) -> Result<(), String> {
    show_capture(app, "compact")
}

fn recognition_summary(drafts: &[TaskDraft]) -> String {
    let details = drafts
        .iter()
        .take(3)
        .map(|draft| {
            let due = draft
                .due_at
                .as_deref()
                .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
                .map(|value| {
                    value
                        .with_timezone(&Local)
                        .format("%m/%d %H:%M")
                        .to_string()
                })
                .unwrap_or_else(|| "未设置日期".into());
            let priority = match draft.priority.as_str() {
                "high" => "高优先级",
                "low" => "低优先级",
                _ => "普通优先级",
            };
            format!("{}（{}，{}）", draft.title, due, priority)
        })
        .collect::<Vec<_>>()
        .join("；");
    let remainder = if drafts.len() > 3 {
        "；其余任务已添加"
    } else {
        ""
    };
    format!(
        "已识别并添加 {} 项任务：{}{}",
        drafts.len(),
        details,
        remainder
    )
}

fn save_recognized_tasks(
    app: &AppHandle,
    db: &Database,
    drafts: Vec<TaskDraft>,
    source_type: String,
) -> Result<String, String> {
    if drafts.is_empty() {
        return Err("没有识别到可创建的任务".into());
    }
    for draft in &drafts {
        db.create_task(draft.clone(), source_type.clone())?;
    }

    let summary = recognition_summary(&drafts);
    let _ = app
        .notification()
        .builder()
        .title("Cadence 已识别任务")
        .body(&summary)
        .show();
    let _ = app.emit_to(CAPTURE_WINDOW_LABEL, "recognition:created", &summary);
    Ok(summary)
}

fn report_recognition_error(app: &AppHandle, error: String) {
    let message = error.chars().take(320).collect::<String>();
    let _ = app
        .notification()
        .builder()
        .title("Cadence 识别失败")
        .body(&message)
        .show();
    let _ = app.emit_to(CAPTURE_WINDOW_LABEL, "recognition:error", &message);
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let quick_capture = MenuItem::with_id(app, "quick-capture", "快速记录", true, None::<&str>)?;
    let task_panel = MenuItem::with_id(app, "open-task-panel", "打开任务清单", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "open-settings", "设置", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出 Cadence", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&quick_capture, &task_panel, &settings, &separator, &quit],
    )?;

    let tray = TrayIconBuilder::with_id("cadence-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Cadence")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quick-capture" => {
                try_show_capture(app, "compact");
            }
            "open-task-panel" => {
                try_show_capture(app, "panel");
            }
            "open-settings" => open_settings(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                try_show_capture(tray.app_handle(), "compact");
            }
        });
    let tray = if let Some(icon) = app.default_window_icon() {
        tray.icon(icon.clone())
    } else {
        tray
    };
    let _tray = tray.build(app)?;
    Ok(())
}

#[tauri::command]
async fn task_create(state: State<'_, AppState>, input: CreateTaskInput) -> Result<Task, String> {
    let CreateTaskInput {
        raw_input,
        source_type,
        source_excerpt,
    } = input;
    let db = state.db.clone();
    let settings = db.settings()?;
    let draft = integrations::parse_manual_task(&settings, &raw_input, source_excerpt).await?;
    db.create_task(draft, source_type.unwrap_or_else(|| "manual".into()))
}

#[tauri::command]
fn recognition_schedule_manual(
    app: AppHandle,
    state: State<'_, AppState>,
    input: CreateTaskInput,
) -> Result<(), String> {
    let CreateTaskInput {
        raw_input,
        source_type,
        source_excerpt,
    } = input;
    let db = state.db.clone();
    let source_type = source_type.unwrap_or_else(|| "manual".into());
    tauri::async_runtime::spawn(async move {
        let result = async {
            let settings = db.settings()?;
            let draft =
                integrations::parse_manual_task(&settings, &raw_input, source_excerpt).await?;
            save_recognized_tasks(&app, &db, vec![draft], source_type)
        }
        .await;
        if let Err(error) = result {
            report_recognition_error(&app, error);
        }
    });
    Ok(())
}

#[tauri::command]
fn task_create_from_draft(
    state: State<'_, AppState>,
    draft: TaskDraft,
    source_type: String,
) -> Result<Task, String> {
    state.db.create_task(draft, source_type)
}
#[tauri::command]
fn task_list(state: State<'_, AppState>, view: String) -> Result<Vec<Task>, String> {
    state.db.list_tasks(&view)
}
#[tauri::command]
fn task_complete(state: State<'_, AppState>, id: String) -> Result<Option<Task>, String> {
    state.db.set_status(&id, "completed")
}
#[tauri::command]
fn task_reopen(state: State<'_, AppState>, id: String) -> Result<Option<Task>, String> {
    state.db.set_status(&id, "open")
}
#[tauri::command]
fn task_delete(state: State<'_, AppState>, id: String) -> Result<Option<Task>, String> {
    state.db.delete_task(&id)?;
    Ok(None)
}

#[tauri::command]
fn capture_set_mode(app: AppHandle, mode: String) -> Result<(), String> {
    resize_capture(&app, &mode)
}

#[tauri::command]
fn capture_hide(app: AppHandle) -> Result<(), String> {
    resize_capture(&app, "compact")?;
    if let Some(window) = app.get_webview_window(CAPTURE_WINDOW_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn screenshot_selection_start(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(CAPTURE_WINDOW_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
    }
    if let Err(error) = open_screenshot_selection(&app) {
        return match show_capture(&app, "compact") {
            Ok(()) => Err(error),
            Err(recovery_error) => Err(format!(
                "{}；恢复快速记录窗口失败：{}",
                error, recovery_error
            )),
        };
    }
    Ok(())
}

#[tauri::command]
fn screenshot_selection_submit(
    app: AppHandle,
    state: State<'_, AppState>,
    selection: ScreenshotSelection,
) -> Result<(), String> {
    let region = match screenshot_region(&app, &selection) {
        Ok(region) => region,
        Err(error) => {
            return match dismiss_screenshot_selection(&app) {
                Ok(()) => Err(error),
                Err(recovery_error) => Err(format!(
                    "{}；恢复快速记录窗口失败：{}",
                    error, recovery_error
                )),
            };
        }
    };
    if let Err(error) = hide_screenshot_selection(&app) {
        return match show_capture(&app, "compact") {
            Ok(()) => Err(error),
            Err(recovery_error) => Err(format!(
                "{}；恢复快速记录窗口失败：{}",
                error, recovery_error
            )),
        };
    }
    let db = state.db.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(80)).await;
        let captured = tauri::async_runtime::spawn_blocking(move || {
            integrations::capture_primary_screen_region(
                region.x,
                region.y,
                region.width,
                region.height,
            )
        })
        .await
        .map_err(|error| error.to_string())
        .and_then(|result| result);
        let restore_error = show_capture(&app, "compact").err();

        let result = match captured {
            Ok(data_url) => {
                async {
                    let settings = db.settings()?;
                    let drafts = integrations::analyze_image(&settings, &data_url).await?;
                    save_recognized_tasks(&app, &db, drafts, "screenshot".into())
                }
                .await
            }
            Err(error) => Err(error),
        };
        if let Some(error) = restore_error {
            report_recognition_error(&app, format!("无法恢复快速记录窗口：{}", error));
        }
        if let Err(error) = result {
            report_recognition_error(&app, error);
        }
    });
    Ok(())
}

#[tauri::command]
fn screenshot_selection_cancel(app: AppHandle) -> Result<(), String> {
    dismiss_screenshot_selection(&app)
}

#[tauri::command]
fn recognition_create(
    app: AppHandle,
    state: State<'_, AppState>,
    drafts: Vec<TaskDraft>,
    source_type: String,
) -> Result<String, String> {
    save_recognized_tasks(&app, &state.db, drafts, source_type)
}

#[tauri::command]
fn recognition_schedule_text(
    app: AppHandle,
    state: State<'_, AppState>,
    content: String,
    source_type: String,
) -> Result<(), String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn(async move {
        let result = async {
            let settings = db.settings()?;
            let drafts = integrations::analyze_text(&settings, &content).await?;
            save_recognized_tasks(&app, &db, drafts, source_type)
        }
        .await;
        if let Err(error) = result {
            report_recognition_error(&app, error);
        }
    });
    Ok(())
}

#[tauri::command]
fn recognition_schedule_image(
    app: AppHandle,
    state: State<'_, AppState>,
    data_url: String,
    source_type: String,
) -> Result<(), String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn(async move {
        let result = async {
            let settings = db.settings()?;
            let drafts = integrations::analyze_image(&settings, &data_url).await?;
            save_recognized_tasks(&app, &db, drafts, source_type)
        }
        .await;
        if let Err(error) = result {
            report_recognition_error(&app, error);
        }
    });
    Ok(())
}

#[tauri::command]
async fn analyze_text(
    state: State<'_, AppState>,
    content: String,
) -> Result<Vec<TaskDraft>, String> {
    integrations::analyze_text(&state.db.settings()?, &content).await
}
#[tauri::command]
async fn analyze_image(
    state: State<'_, AppState>,
    data_url: String,
) -> Result<Vec<TaskDraft>, String> {
    integrations::analyze_image(&state.db.settings()?, &data_url).await
}
#[tauri::command]
async fn capture_primary_screen() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(integrations::capture_primary_screen)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn settings_get(state: State<'_, AppState>) -> Result<AppSettings, String> {
    state.db.settings()
}
#[tauri::command]
fn settings_update(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
    secrets: Option<SecretUpdates>,
) -> Result<(), String> {
    if let Some(secrets) = secrets {
        if let Some(key) = secrets.ai_key.filter(|value| !value.is_empty()) {
            integrations::save_secret("ai-api-key", &key)?;
        }
        if let Some(secret) = secrets.lark_secret.filter(|value| !value.is_empty()) {
            integrations::save_secret("lark-app-secret", &secret)?;
        }
    }
    state.db.save_settings(&settings)?;
    let _ = app.emit_to(CAPTURE_WINDOW_LABEL, "settings:updated", &settings);
    Ok(())
}

#[tauri::command]
async fn weekly_generate(state: State<'_, AppState>, use_ai: bool) -> Result<WeeklyReport, String> {
    let mut report = state.db.generate_weekly()?;
    if use_ai {
        let settings = state.db.settings()?;
        if !settings.ai_base_url.is_empty() && !settings.ai_text_model.is_empty() {
            report.content_markdown =
                integrations::enhance_weekly(&settings, &report.content_markdown).await?;
            report.ai_status = "generated".into();
            report.generated_at = chrono::Utc::now().to_rfc3339();
            state.db.save_weekly_report(&report)?;
        }
    }
    let settings = state.db.settings()?;
    if integrations::has_lark_token() && !settings.lark_document_url.trim().is_empty() {
        integrations::lark_append_report(&settings, &report).await?;
    }
    Ok(report)
}
#[tauri::command]
fn weekly_list(state: State<'_, AppState>) -> Result<Vec<WeeklyReport>, String> {
    state.db.weekly_reports()
}

#[tauri::command]
fn lark_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    let settings = state.db.settings()?;
    let configured = !settings.lark_app_id.is_empty() && !settings.lark_base_url.is_empty();
    let status = if !configured {
        "disabled"
    } else if integrations::has_lark_token() {
        "idle"
    } else {
        "auth_required"
    };
    Ok(SyncStatus {
        state: status.into(),
        pending_count: state.db.pending_sync_count()?,
        last_success_at: None,
        last_error: None,
    })
}
#[tauri::command]
async fn lark_oauth_begin(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SyncStatus, String> {
    let settings = state.db.settings()?;
    integrations::lark_oauth(&app, &settings).await?;
    Ok(SyncStatus {
        state: "idle".into(),
        pending_count: state.db.pending_sync_count()?,
        last_success_at: None,
        last_error: None,
    })
}
#[tauri::command]
async fn lark_sync_now(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    let settings = state.db.settings()?;
    integrations::lark_sync(&state.db, &settings).await
}

fn spawn_reminder_worker(app: tauri::AppHandle, db: Arc<Database>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            if let Ok(reminders) = db.due_reminders() {
                for (id, title) in reminders {
                    if app
                        .notification()
                        .builder()
                        .title("Cadence · 即将到期")
                        .body(&title)
                        .show()
                        .is_ok()
                    {
                        let _ = db.mark_reminder_fired(&id);
                    }
                }
            }
            if let Ok(settings) = db.settings() {
                let now = Local::now();
                let scheduled = settings
                    .weekly_time
                    .split_once(':')
                    .and_then(|(hour, minute)| {
                        Some((hour.parse::<u32>().ok()?, minute.parse::<u32>().ok()?))
                    });
                if settings.weekly_enabled
                    && now.weekday().num_days_from_sunday() as u8 == settings.weekly_day
                    && scheduled
                        .map(|(hour, minute)| (now.hour(), now.minute()) >= (hour, minute))
                        .unwrap_or(false)
                {
                    let monday = (now
                        - chrono::Duration::days(now.weekday().num_days_from_monday() as i64))
                    .date_naive()
                    .to_string();
                    let already_generated = db
                        .weekly_reports()
                        .ok()
                        .and_then(|items| items.first().cloned())
                        .map(|report| report.period_start == monday)
                        .unwrap_or(false);
                    if !already_generated {
                        if let Ok(report) = db.generate_weekly() {
                            if integrations::has_lark_token()
                                && !settings.lark_document_url.trim().is_empty()
                            {
                                let _ = integrations::lark_append_report(&settings, &report).await;
                            }
                        }
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_logical_screenshot_selection_to_physical_pixels() {
        let selection = ScreenshotSelection {
            x: 100.0,
            y: 50.0,
            width: 300.0,
            height: 200.0,
        };
        assert_eq!(
            normalize_screenshot_selection(&selection, 1.5, 2880, 1800).unwrap(),
            ScreenshotRegion {
                x: 150,
                y: 75,
                width: 450,
                height: 300,
            }
        );
    }

    #[test]
    fn rejects_empty_screenshot_selection() {
        let selection = ScreenshotSelection {
            x: 12.0,
            y: 12.0,
            width: 0.0,
            height: 120.0,
        };
        assert!(normalize_screenshot_selection(&selection, 1.0, 1920, 1080).is_err());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            try_show_capture(app, "compact");
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        try_show_capture(app, "compact");
                    }
                })
                .build(),
        )
        .setup(|app| {
            let path = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?
                .join("cadence.sqlite3");
            let db = Arc::new(Database::open(path)?);
            app.manage(AppState { db: db.clone() });
            let _ = app
                .global_shortcut()
                .register("CommandOrControl+Shift+Space");
            let _ = app.autolaunch().enable();
            setup_tray(app)?;
            position_capture_window(&app.handle());
            spawn_reminder_worker(app.handle().clone(), db);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == CAPTURE_WINDOW_LABEL {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    WindowEvent::Focused(false) => {
                        let _ = window.hide();
                    }
                    _ => {}
                }
            } else if window.label() == SCREENSHOT_SELECTION_WINDOW_LABEL {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Err(error) = dismiss_screenshot_selection(&window.app_handle()) {
                        eprintln!("无法关闭截图窗口：{}", error);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            task_create,
            recognition_schedule_manual,
            task_create_from_draft,
            task_list,
            task_complete,
            task_reopen,
            task_delete,
            capture_set_mode,
            capture_hide,
            screenshot_selection_start,
            screenshot_selection_submit,
            screenshot_selection_cancel,
            recognition_create,
            recognition_schedule_text,
            recognition_schedule_image,
            analyze_text,
            analyze_image,
            capture_primary_screen,
            settings_get,
            settings_update,
            weekly_generate,
            weekly_list,
            lark_status,
            lark_oauth_begin,
            lark_sync_now
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cadence");
}
