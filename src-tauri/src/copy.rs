pub const APP_NAME: &str = "Cadence";
pub const SETTINGS_WINDOW_TITLE: &str = "Cadence 设置";
pub const SCREENSHOT_WINDOW_TITLE: &str = "Cadence 截图识别";
pub const RECOGNIZED_TASKS_NOTIFICATION_TITLE: &str = "Cadence 已识别任务";
pub const RECOGNITION_FAILED_NOTIFICATION_TITLE: &str = "Cadence 识别失败";
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
pub const ERR_RUNNING_APP: &str = "error while running Cadence";

pub const RECOGNITION_NO_DUE_DATE: &str = "未设置日期";
pub const PRIORITY_HIGH: &str = "高优先级";
pub const PRIORITY_LOW: &str = "低优先级";
pub const PRIORITY_NORMAL: &str = "普通优先级";
pub const RECOGNITION_REMAINDER: &str = "；其余任务已添加";

pub fn screenshot_focus_cleanup_failed(error: &str, cleanup_error: &str) -> String {
    format!(
        "截图窗口无法获得焦点：{}；清理截图窗口失败：{}",
        error, cleanup_error
    )
}

pub fn screenshot_destroy_hidden(destroy_error: &str) -> String {
    format!(
        "销毁截图窗口失败：{}；已隐藏截图窗口，暂不能重新创建",
        destroy_error
    )
}

pub fn screenshot_destroy_hide_failed(destroy_error: &str, hide_error: &str) -> String {
    format!(
        "销毁截图窗口失败：{}；隐藏截图窗口也失败：{}",
        destroy_error, hide_error
    )
}

pub fn screenshot_hide_destroy_failed(hide_error: &str, destroy_error: &str) -> String {
    format!(
        "隐藏截图窗口失败：{}；销毁截图窗口也失败：{}",
        hide_error, destroy_error
    )
}

pub fn restore_capture_failed(error: &str, recovery_error: &str) -> String {
    format!("{}；恢复快速记录窗口失败：{}", error, recovery_error)
}

pub fn capture_restore_failed(error: &str) -> String {
    format!("无法恢复快速记录窗口：{}", error)
}

pub fn log_show_capture_failed(error: &str) -> String {
    format!("无法显示快速记录窗口：{}", error)
}

pub fn log_close_screenshot_failed(error: &str) -> String {
    format!("无法关闭截图窗口：{}", error)
}

pub fn recognition_summary(count: usize, details: &str, remainder: &str) -> String {
    format!("已识别并添加 {} 项任务：{}{}", count, details, remainder)
}
