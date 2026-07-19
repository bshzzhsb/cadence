use serde::{Deserialize, Serialize};

pub const DEFAULT_AI_MODEL: &str = "mimo-v2.5";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub notes: Option<String>,
    pub due_at: Option<String>,
    pub timezone: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub status: String,
    pub source_type: String,
    pub source_excerpt: Option<String>,
    pub version: i64,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub raw_input: String,
    pub source_type: Option<String>,
    pub source_excerpt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDraft {
    pub title: String,
    pub notes: Option<String>,
    pub due_at: Option<String>,
    pub timezone: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub source_excerpt: Option<String>,
    pub confidence: f32,
    pub uncertain_fields: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AppSettings {
    pub default_due_hour: u8,
    pub weekly_day: u8,
    pub weekly_time: String,
    pub weekly_enabled: bool,
    pub theme: String,
    pub ai_base_url: String,
    pub ai_text_model: String,
    pub ai_vision_model: String,
    pub lark_app_id: String,
    pub lark_base_url: String,
    pub lark_document_url: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_due_hour: 18,
            weekly_day: 0,
            weekly_time: "20:00".into(),
            weekly_enabled: true,
            theme: "system".into(),
            ai_base_url: String::new(),
            ai_text_model: DEFAULT_AI_MODEL.into(),
            ai_vision_model: DEFAULT_AI_MODEL.into(),
            lark_app_id: String::new(),
            lark_base_url: String::new(),
            lark_document_url: String::new(),
        }
    }
}

impl AppSettings {
    pub fn normalized(mut self) -> Self {
        if self.ai_text_model.trim().is_empty() {
            self.ai_text_model = DEFAULT_AI_MODEL.into();
        }
        if self.ai_vision_model.trim().is_empty() {
            self.ai_vision_model = DEFAULT_AI_MODEL.into();
        }
        self
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretUpdates {
    pub ai_key: Option<String>,
    pub lark_secret: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyReport {
    pub id: String,
    pub period_start: String,
    pub period_end: String,
    pub content_markdown: String,
    pub ai_status: String,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub state: String,
    pub pending_count: i64,
    pub last_success_at: Option<String>,
    pub last_error: Option<String>,
}
