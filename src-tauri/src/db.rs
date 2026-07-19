use chrono::{Datelike, Duration, Local, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use std::{fs, path::PathBuf, sync::Mutex};
use uuid::Uuid;

use crate::models::{AppSettings, Task, TaskDraft, WeeklyReport};

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT, due_at TEXT, timezone TEXT NOT NULL, priority TEXT NOT NULL, tags_json TEXT NOT NULL, status TEXT NOT NULL, source_type TEXT NOT NULL, source_excerpt TEXT, version INTEGER NOT NULL DEFAULT 1, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
            CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), trigger_at TEXT NOT NULL, kind TEXT NOT NULL, fired_at TEXT, cancelled_at TEXT);
            CREATE TABLE IF NOT EXISTS task_events (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, event_type TEXT NOT NULL, payload_json TEXT NOT NULL, occurred_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS weekly_reports (id TEXT PRIMARY KEY, period_start TEXT NOT NULL UNIQUE, period_end TEXT NOT NULL, content_markdown TEXT NOT NULL, ai_status TEXT NOT NULL, generated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sync_outbox (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, task_version INTEGER NOT NULL, operation TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, last_error TEXT, created_at TEXT NOT NULL);")
            .map_err(|error| error.to_string())?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn settings(&self) -> Result<AppSettings, String> {
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        let raw: Option<String> = connection
            .query_row("SELECT value FROM settings WHERE key='app'", [], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|error| error.to_string())?;
        raw.map(|value| {
            serde_json::from_str::<AppSettings>(&value)
                .map(AppSettings::normalized)
                .map_err(|error| error.to_string())
        })
        .unwrap_or_else(|| Ok(AppSettings::default()))
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), String> {
        let raw = serde_json::to_string(settings).map_err(|error| error.to_string())?;
        self.connection.lock().map_err(|error| error.to_string())?.execute("INSERT INTO settings(key,value) VALUES('app',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![raw]).map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn create_task(&self, draft: TaskDraft, source_type: String) -> Result<Task, String> {
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let tags = serde_json::to_string(&draft.tags).map_err(|error| error.to_string())?;
        connection.execute("INSERT INTO tasks(id,title,notes,due_at,timezone,priority,tags_json,status,source_type,source_excerpt,version,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,'open',?8,?9,1,?10,?10)", params![id,draft.title,draft.notes,draft.due_at,draft.timezone,draft.priority,tags,source_type,draft.source_excerpt,now]).map_err(|error| error.to_string())?;
        if let Some(due) = &draft.due_at {
            if let Ok(due_time) = chrono::DateTime::parse_from_rfc3339(due) {
                for (kind, hours) in [("before_24h", 24), ("before_1h", 1)] {
                    let trigger = (due_time - Duration::hours(hours)).with_timezone(&Utc);
                    if trigger > Utc::now() {
                        connection.execute("INSERT INTO reminders(id,task_id,trigger_at,kind) VALUES(?1,?2,?3,?4)", params![Uuid::new_v4().to_string(),id,trigger.to_rfc3339(),kind]).map_err(|error| error.to_string())?;
                    }
                }
            }
        }
        connection.execute("INSERT INTO task_events(id,task_id,event_type,payload_json,occurred_at) VALUES(?1,?2,'created','{}',?3)", params![Uuid::new_v4().to_string(),id,now]).map_err(|error| error.to_string())?;
        connection.execute("INSERT INTO sync_outbox(id,task_id,task_version,operation,next_attempt_at,created_at) VALUES(?1,?2,1,'upsert',?3,?3)", params![Uuid::new_v4().to_string(),id,now]).map_err(|error| error.to_string())?;
        drop(connection);
        self.get_task(&id)?
            .ok_or_else(|| "Task was not created".into())
    }

    pub fn get_task(&self, id: &str) -> Result<Option<Task>, String> {
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        connection.query_row("SELECT id,title,notes,due_at,timezone,priority,tags_json,status,source_type,source_excerpt,version,completed_at,created_at,updated_at FROM tasks WHERE id=?1 AND deleted_at IS NULL", params![id], task_from_row).optional().map_err(|error| error.to_string())
    }

    pub fn list_tasks(&self, view: &str) -> Result<Vec<Task>, String> {
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        let mut statement = connection.prepare("SELECT id,title,notes,due_at,timezone,priority,tags_json,status,source_type,source_excerpt,version,completed_at,created_at,updated_at FROM tasks WHERE deleted_at IS NULL ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at, created_at DESC").map_err(|error| error.to_string())?;
        let tasks = statement
            .query_map([], task_from_row)
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        Ok(tasks
            .into_iter()
            .filter(|task| task_matches_view(task, view))
            .collect())
    }

    pub fn set_status(&self, id: &str, status: &str) -> Result<Option<Task>, String> {
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        let now = Utc::now().to_rfc3339();
        let completed: Option<String> = if status == "completed" {
            Some(now.clone())
        } else {
            None
        };
        connection.execute("UPDATE tasks SET status=?2,completed_at=?3,updated_at=?4,version=version+1 WHERE id=?1 AND deleted_at IS NULL", params![id,status,completed,now]).map_err(|error| error.to_string())?;
        connection
            .execute(
                "UPDATE reminders SET cancelled_at=?2 WHERE task_id=?1 AND fired_at IS NULL",
                params![id, now],
            )
            .map_err(|error| error.to_string())?;
        if status == "open" {
            let due: Option<String> = connection
                .query_row("SELECT due_at FROM tasks WHERE id=?1", params![id], |row| {
                    row.get(0)
                })
                .optional()
                .map_err(|error| error.to_string())?
                .flatten();
            if let Some(due) = due {
                if let Ok(due_time) = chrono::DateTime::parse_from_rfc3339(&due) {
                    for (kind, hours) in [("before_24h", 24), ("before_1h", 1)] {
                        let trigger = (due_time - Duration::hours(hours)).with_timezone(&Utc);
                        if trigger > Utc::now() {
                            connection.execute("INSERT INTO reminders(id,task_id,trigger_at,kind) VALUES(?1,?2,?3,?4)", params![Uuid::new_v4().to_string(),id,trigger.to_rfc3339(),kind]).map_err(|error| error.to_string())?;
                        }
                    }
                }
            }
        }
        connection.execute("INSERT INTO task_events(id,task_id,event_type,payload_json,occurred_at) VALUES(?1,?2,?3,'{}',?4)", params![Uuid::new_v4().to_string(),id,status,now]).map_err(|error| error.to_string())?;
        connection
            .execute("DELETE FROM sync_outbox WHERE task_id=?1", params![id])
            .map_err(|error| error.to_string())?;
        connection.execute("INSERT INTO sync_outbox(id,task_id,task_version,operation,next_attempt_at,created_at) SELECT ?1,id,version,'upsert',?3,?3 FROM tasks WHERE id=?2", params![Uuid::new_v4().to_string(),id,now]).map_err(|error| error.to_string())?;
        drop(connection);
        self.get_task(id)
    }

    pub fn delete_task(&self, id: &str) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        connection
            .execute(
                "UPDATE tasks SET deleted_at=?2,updated_at=?2,version=version+1 WHERE id=?1",
                params![id, now],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute("DELETE FROM sync_outbox WHERE task_id=?1", params![id])
            .map_err(|error| error.to_string())?;
        connection.execute("INSERT INTO sync_outbox(id,task_id,task_version,operation,next_attempt_at,created_at) SELECT ?1,id,version,'delete',?3,?3 FROM tasks WHERE id=?2", params![Uuid::new_v4().to_string(),id,now]).map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn due_reminders(&self) -> Result<Vec<(String, String)>, String> {
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        let mut statement=connection.prepare("SELECT reminders.id,tasks.title FROM reminders JOIN tasks ON tasks.id=reminders.task_id WHERE reminders.fired_at IS NULL AND reminders.cancelled_at IS NULL AND tasks.status='open' AND reminders.trigger_at<=?1").map_err(|error| error.to_string())?;
        let result = statement
            .query_map(params![Utc::now().to_rfc3339()], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string());
        result
    }
    pub fn mark_reminder_fired(&self, id: &str) -> Result<(), String> {
        self.connection
            .lock()
            .map_err(|error| error.to_string())?
            .execute(
                "UPDATE reminders SET fired_at=?2 WHERE id=?1",
                params![id, Utc::now().to_rfc3339()],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn generate_weekly(&self) -> Result<WeeklyReport, String> {
        let now = Local::now();
        let days = now.weekday().num_days_from_monday() as i64;
        let start = (now - Duration::days(days)).date_naive();
        let end = start + Duration::days(6);
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        let created: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND date(created_at)>=?1",
                params![start.to_string()],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let completed:i64=connection.query_row("SELECT COUNT(*) FROM tasks WHERE completed_at IS NOT NULL AND date(completed_at)>=?1",params![start.to_string()],|row|row.get(0)).map_err(|error|error.to_string())?;
        let open: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE status='open' AND deleted_at IS NULL",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let mut statement=connection.prepare("SELECT title FROM tasks WHERE completed_at IS NOT NULL AND date(completed_at)>=?1 ORDER BY completed_at").map_err(|error|error.to_string())?;
        let titles = statement
            .query_map(params![start.to_string()], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        let bullets = if titles.is_empty() {
            "- 本周暂无完成记录".into()
        } else {
            titles
                .iter()
                .map(|title| format!("- {}", title))
                .collect::<Vec<_>>()
                .join("\n")
        };
        let content=format!("# {}—{} 周总结\n\n## 概览\n\n- 新增任务：{}\n- 完成任务：{}\n- 当前待办：{}\n\n## 本周完成\n\n{}\n\n## 下周关注\n\n- 优先处理仍未完成且临近截止的任务。",start,end,created,completed,open,bullets);
        let report = WeeklyReport {
            id: Uuid::new_v4().to_string(),
            period_start: start.to_string(),
            period_end: end.to_string(),
            content_markdown: content,
            ai_status: "fallback".into(),
            generated_at: Utc::now().to_rfc3339(),
        };
        connection.execute("INSERT INTO weekly_reports(id,period_start,period_end,content_markdown,ai_status,generated_at) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(period_start) DO UPDATE SET content_markdown=excluded.content_markdown,ai_status=excluded.ai_status,generated_at=excluded.generated_at",params![report.id,report.period_start,report.period_end,report.content_markdown,report.ai_status,report.generated_at]).map_err(|error|error.to_string())?;
        Ok(report)
    }

    pub fn weekly_reports(&self) -> Result<Vec<WeeklyReport>, String> {
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        let mut statement=connection.prepare("SELECT id,period_start,period_end,content_markdown,ai_status,generated_at FROM weekly_reports ORDER BY period_start DESC").map_err(|error|error.to_string())?;
        let result = statement
            .query_map([], |row| {
                Ok(WeeklyReport {
                    id: row.get(0)?,
                    period_start: row.get(1)?,
                    period_end: row.get(2)?,
                    content_markdown: row.get(3)?,
                    ai_status: row.get(4)?,
                    generated_at: row.get(5)?,
                })
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string());
        result
    }
    pub fn save_weekly_report(&self, report: &WeeklyReport) -> Result<(), String> {
        self.connection.lock().map_err(|error|error.to_string())?.execute("INSERT INTO weekly_reports(id,period_start,period_end,content_markdown,ai_status,generated_at) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(period_start) DO UPDATE SET content_markdown=excluded.content_markdown,ai_status=excluded.ai_status,generated_at=excluded.generated_at",params![report.id,report.period_start,report.period_end,report.content_markdown,report.ai_status,report.generated_at]).map_err(|error|error.to_string())?;
        Ok(())
    }
    pub fn pending_sync_count(&self) -> Result<i64, String> {
        self.connection
            .lock()
            .map_err(|error| error.to_string())?
            .query_row("SELECT COUNT(*) FROM sync_outbox", [], |row| row.get(0))
            .map_err(|error| error.to_string())
    }
    pub fn pending_sync_tasks(&self) -> Result<Vec<Task>, String> {
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        let mut statement=connection.prepare("SELECT id,title,notes,due_at,timezone,priority,tags_json,CASE WHEN deleted_at IS NULL THEN status ELSE 'deleted' END,source_type,source_excerpt,version,completed_at,created_at,updated_at FROM tasks WHERE id IN (SELECT DISTINCT task_id FROM sync_outbox) ORDER BY updated_at").map_err(|error|error.to_string())?;
        let result = statement
            .query_map([], task_from_row)
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string());
        result
    }
    pub fn clear_sync_for_task(&self, id: &str) -> Result<(), String> {
        self.connection
            .lock()
            .map_err(|error| error.to_string())?
            .execute("DELETE FROM sync_outbox WHERE task_id=?1", params![id])
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

fn task_matches_view(task: &Task, view: &str) -> bool {
    match view {
        "history" => task.status == "completed",
        "future" => task.status == "open",
        _ => task.status == "open",
    }
}

#[cfg(test)]
mod tests {
    use super::{task_matches_view, Database};
    use crate::models::{AppSettings, Task, DEFAULT_AI_MODEL};

    fn task(status: &str) -> Task {
        Task {
            id: "task".into(),
            title: "任务".into(),
            notes: None,
            due_at: None,
            timezone: "Asia/Shanghai".into(),
            priority: "normal".into(),
            tags: Vec::new(),
            status: status.into(),
            source_type: "manual".into(),
            source_excerpt: None,
            version: 1,
            completed_at: None,
            created_at: "2026-07-19T00:00:00Z".into(),
            updated_at: "2026-07-19T00:00:00Z".into(),
        }
    }

    #[test]
    fn filters_future_and_history_views_by_status() {
        let open = task("open");
        let completed = task("completed");

        assert!(task_matches_view(&open, "future"));
        assert!(!task_matches_view(&completed, "future"));
        assert!(!task_matches_view(&open, "history"));
        assert!(task_matches_view(&completed, "history"));
    }

    #[test]
    fn stores_settings_in_sqlite() {
        let db = Database::open(":memory:".into()).unwrap();
        let mut settings = AppSettings::default();
        settings.ai_base_url = "https://example.test/v1".into();
        settings.ai_text_model = "text-model".into();
        settings.ai_vision_model = "vision-model".into();

        db.save_settings(&settings).unwrap();

        assert_eq!(db.settings().unwrap(), settings);
    }

    #[test]
    fn normalizes_legacy_empty_model_names() {
        let db = Database::open(":memory:".into()).unwrap();
        let mut settings = AppSettings::default();
        settings.ai_text_model.clear();
        settings.ai_vision_model.clear();
        db.save_settings(&settings).unwrap();

        let loaded = db.settings().unwrap();
        assert_eq!(loaded.ai_text_model, DEFAULT_AI_MODEL);
        assert_eq!(loaded.ai_vision_model, DEFAULT_AI_MODEL);
    }
}

fn task_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    let tags_raw: String = row.get(6)?;
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        notes: row.get(2)?,
        due_at: row.get(3)?,
        timezone: row.get(4)?,
        priority: row.get(5)?,
        tags: serde_json::from_str(&tags_raw).unwrap_or_default(),
        status: row.get(7)?,
        source_type: row.get(8)?,
        source_excerpt: row.get(9)?,
        version: row.get(10)?,
        completed_at: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}
