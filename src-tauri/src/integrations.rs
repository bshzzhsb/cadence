use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Datelike;
use image::{DynamicImage, ImageFormat};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::io::Cursor;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use url::Url;
use xcap::Monitor;

use crate::{
    db::Database,
    models::{AppSettings, SyncStatus, Task, TaskDraft, WeeklyReport},
    parser::parse_task,
};

const SERVICE: &str = "com.cadence.desktop";
const MIMO_IDENTITY: &str = "你是MiMo（中文名称也是MiMo），是小米公司研发的AI智能助手。";

pub fn save_secret(key: &str, value: &str) -> Result<(), String> {
    Entry::new(SERVICE, key)
        .map_err(|error| error.to_string())?
        .set_password(value)
        .map_err(|error| error.to_string())
}

fn read_secret(key: &str) -> Result<String, String> {
    Entry::new(SERVICE, key)
        .map_err(|error| error.to_string())?
        .get_password()
        .map_err(|_| format!("缺少 {}，请先在设置中配置", key))
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn ai_base_url(settings: &AppSettings) -> Option<String> {
    non_empty(&settings.ai_base_url)
}

fn ai_config(settings: &AppSettings) -> Result<(String, String), String> {
    let base_url = ai_base_url(settings)
        .ok_or_else(|| "尚未配置模型服务地址，请在设置界面填写 AI 服务地址".to_string())?;
    let api_key = read_secret("ai-api-key")
        .map_err(|_| "尚未配置模型 API Key，请在设置界面填写 API Key".to_string())?;
    Ok((base_url, api_key))
}

fn configured_model(value: &str, label: &str) -> Result<String, String> {
    non_empty(value).ok_or_else(|| format!("尚未配置{}模型，请在设置界面填写", label))
}

fn mimo_system_prompt(now: &chrono::DateTime<chrono::Local>) -> String {
    let week = match now.weekday().num_days_from_monday() {
        0 => "星期一",
        1 => "星期二",
        2 => "星期三",
        3 => "星期四",
        4 => "星期五",
        5 => "星期六",
        _ => "星期日",
    };
    format!(
        "{}\n今天的日期：{} {}，你的知识截止日期是2024年12月。",
        MIMO_IDENTITY,
        now.format("%Y-%m-%d"),
        week
    )
}

pub fn has_lark_token() -> bool {
    read_secret("lark-oauth-token").is_ok()
}

#[derive(Debug, Serialize, Deserialize)]
struct LarkToken {
    access_token: String,
    refresh_token: String,
    expires_at: i64,
}

pub async fn lark_oauth(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    if settings.lark_app_id.trim().is_empty() {
        return Err("请先填写飞书 App ID".into());
    }
    let secret = read_secret("lark-app-secret")?;
    let state = uuid::Uuid::new_v4().to_string();
    let redirect = "http://127.0.0.1:34115/oauth/feishu/callback";
    let listener = TcpListener::bind("127.0.0.1:34115")
        .await
        .map_err(|_| "无法监听 OAuth 回调端口 34115，请关闭占用该端口的程序".to_string())?;
    let auth_url=format!("https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id={}&redirect_uri={}&state={}&scope={}",urlencoding::encode(&settings.lark_app_id),urlencoding::encode(redirect),urlencoding::encode(&state),urlencoding::encode("offline_access bitable:app docx:document"));
    app.opener()
        .open_url(auth_url, None::<&str>)
        .map_err(|error| error.to_string())?;
    let (mut socket, _) =
        tokio::time::timeout(std::time::Duration::from_secs(180), listener.accept())
            .await
            .map_err(|_| "飞书授权超时，请重试".to_string())?
            .map_err(|error| error.to_string())?;
    let mut buffer = vec![0u8; 8192];
    let count = socket
        .read(&mut buffer)
        .await
        .map_err(|error| error.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..count]);
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| "OAuth 回调格式错误".to_string())?;
    let callback =
        Url::parse(&format!("http://127.0.0.1{}", path)).map_err(|error| error.to_string())?;
    let query = callback
        .query_pairs()
        .collect::<std::collections::HashMap<_, _>>();
    if query.get("state").map(|value| value.as_ref()) != Some(state.as_str()) {
        return Err("OAuth state 校验失败".into());
    }
    let code = query
        .get("code")
        .ok_or_else(|| "飞书未返回授权码".to_string())?
        .to_string();
    let html="<html><meta charset='utf-8'><body style='font-family:system-ui;padding:48px'><h2>Cadence 已连接飞书</h2><p>可以关闭此页面并返回应用。</p></body></html>";
    let response=format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",html.len(),html);
    let _ = socket.write_all(response.as_bytes()).await;
    let payload:Value=reqwest::Client::new().post("https://open.feishu.cn/open-apis/authen/v2/oauth/token").json(&json!({"grant_type":"authorization_code","client_id":settings.lark_app_id,"client_secret":secret,"code":code,"redirect_uri":redirect})).send().await.map_err(|error|error.to_string())?.json().await.map_err(|error|error.to_string())?;
    store_lark_token(payload)
}

fn store_lark_token(payload: Value) -> Result<(), String> {
    if payload.get("code").and_then(Value::as_i64).unwrap_or(0) != 0 {
        return Err(format!("飞书授权失败：{}", payload));
    }
    let root = payload.get("data").unwrap_or(&payload);
    let access = root
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| "飞书响应缺少 access_token".to_string())?;
    let refresh = root
        .get("refresh_token")
        .and_then(Value::as_str)
        .unwrap_or("");
    let expires = root
        .get("expires_in")
        .and_then(Value::as_i64)
        .unwrap_or(7200);
    let token = LarkToken {
        access_token: access.into(),
        refresh_token: refresh.into(),
        expires_at: chrono::Utc::now().timestamp() + expires,
    };
    save_secret(
        "lark-oauth-token",
        &serde_json::to_string(&token).map_err(|error| error.to_string())?,
    )
}

async fn lark_access_token(settings: &AppSettings) -> Result<String, String> {
    let raw = read_secret("lark-oauth-token")?;
    let token: LarkToken = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    if token.expires_at > chrono::Utc::now().timestamp() + 300 {
        return Ok(token.access_token);
    }
    if token.refresh_token.is_empty() {
        return Err("飞书授权已过期，请重新连接".into());
    }
    let secret = read_secret("lark-app-secret")?;
    let payload:Value=reqwest::Client::new().post("https://open.feishu.cn/open-apis/authen/v2/oauth/token").json(&json!({"grant_type":"refresh_token","client_id":settings.lark_app_id,"client_secret":secret,"refresh_token":token.refresh_token})).send().await.map_err(|error|error.to_string())?.json().await.map_err(|error|error.to_string())?;
    store_lark_token(payload.clone())?;
    let root = payload.get("data").unwrap_or(&payload);
    root.get("access_token")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "刷新飞书凭证失败".into())
}

fn parse_base_url(value: &str) -> Result<(String, String), String> {
    let url = Url::parse(value).map_err(|_| "多维表格链接格式不正确".to_string())?;
    let segments = url
        .path_segments()
        .ok_or_else(|| "多维表格链接缺少 app_token".to_string())?
        .collect::<Vec<_>>();
    let base_index = segments
        .iter()
        .position(|item| *item == "base")
        .ok_or_else(|| "请输入 /base/ 类型的飞书多维表格链接".to_string())?;
    let app_token = segments
        .get(base_index + 1)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "链接缺少 app_token".to_string())?
        .to_string();
    let table_id = url
        .query_pairs()
        .find(|(key, _)| key == "table")
        .map(|(_, value)| value.to_string())
        .ok_or_else(|| "链接缺少 table 参数，请打开目标数据表后复制链接".to_string())?;
    Ok((app_token, table_id))
}

async fn lark_json(request: reqwest::RequestBuilder) -> Result<Value, String> {
    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let payload: Value = response.json().await.map_err(|error| error.to_string())?;
    if !status.is_success() || payload.get("code").and_then(Value::as_i64).unwrap_or(0) != 0 {
        return Err(format!("飞书接口失败 {}：{}", status, payload));
    }
    Ok(payload)
}

pub async fn lark_sync(db: &Database, settings: &AppSettings) -> Result<SyncStatus, String> {
    let token = lark_access_token(settings).await?;
    let (app_token, table_id) = parse_base_url(&settings.lark_base_url)?;
    let client = reqwest::Client::new();
    let root = format!(
        "https://open.feishu.cn/open-apis/bitable/v1/apps/{}/tables/{}",
        app_token, table_id
    );
    let fields_payload = lark_json(
        client
            .get(format!("{}/fields?page_size=100", root))
            .bearer_auth(&token),
    )
    .await?;
    let items = fields_payload
        .pointer("/data/items")
        .and_then(Value::as_array)
        .ok_or_else(|| "无法读取飞书字段".to_string())?;
    let primary = items
        .iter()
        .find(|item| item.get("is_primary").and_then(Value::as_bool) == Some(true))
        .and_then(|item| item.get("field_name"))
        .and_then(Value::as_str)
        .unwrap_or("标题")
        .to_string();
    let mut existing = items
        .iter()
        .filter_map(|item| {
            item.get("field_name")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect::<std::collections::HashSet<_>>();
    for field in [
        "Cadence ID",
        "状态",
        "DDL",
        "完成时间",
        "优先级",
        "标签",
        "备注",
        "来源",
        "本地更新时间",
        "Cadence 版本",
    ] {
        if !existing.contains(field) {
            lark_json(
                client
                    .post(format!("{}/fields", root))
                    .bearer_auth(&token)
                    .json(&json!({"field_name":field,"type":1})),
            )
            .await?;
            existing.insert(field.into());
        }
    }
    let records_payload = lark_json(
        client
            .get(format!("{}/records?page_size=500", root))
            .bearer_auth(&token),
    )
    .await?;
    let records = records_payload
        .pointer("/data/items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut id_map = std::collections::HashMap::new();
    for record in records {
        if let (Some(id), Some(cadence)) = (
            record.get("record_id").and_then(Value::as_str),
            record.pointer("/fields/Cadence ID").and_then(Value::as_str),
        ) {
            id_map.insert(cadence.to_string(), id.to_string());
        }
    }
    for task in db.pending_sync_tasks()? {
        let fields = task_fields(&task, &primary);
        if let Some(record_id) = id_map.get(&task.id) {
            lark_json(
                client
                    .put(format!("{}/records/{}", root, record_id))
                    .bearer_auth(&token)
                    .json(&json!({"fields":fields})),
            )
            .await?;
        } else {
            lark_json(
                client
                    .post(format!("{}/records", root))
                    .bearer_auth(&token)
                    .json(&json!({"fields":fields})),
            )
            .await?;
        }
        db.clear_sync_for_task(&task.id)?;
    }
    Ok(SyncStatus {
        state: "idle".into(),
        pending_count: db.pending_sync_count()?,
        last_success_at: Some(chrono::Utc::now().to_rfc3339()),
        last_error: None,
    })
}

pub async fn lark_append_report(
    settings: &AppSettings,
    report: &WeeklyReport,
) -> Result<(), String> {
    if settings.lark_document_url.trim().is_empty() {
        return Ok(());
    }
    let url = Url::parse(&settings.lark_document_url)
        .map_err(|_| "周总结文档链接格式不正确".to_string())?;
    let segments = url
        .path_segments()
        .ok_or_else(|| "周总结文档链接缺少 document_id".to_string())?
        .collect::<Vec<_>>();
    let index = segments
        .iter()
        .position(|item| *item == "docx")
        .ok_or_else(|| "MVP 仅支持 /docx/ 类型的飞书文档链接".to_string())?;
    let document_id = segments
        .get(index + 1)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "周总结文档链接缺少 document_id".to_string())?;
    let token = lark_access_token(settings).await?;
    let client = reqwest::Client::new();
    let list_url = format!(
        "https://open.feishu.cn/open-apis/docx/v1/documents/{}/blocks?page_size=500",
        document_id
    );
    let blocks = lark_json(client.get(list_url).bearer_auth(&token)).await?;
    let child_count = blocks
        .pointer("/data/items")
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("block_id").and_then(Value::as_str) == Some(document_id))
        })
        .and_then(|root| root.get("children"))
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    let mut children = Vec::new();
    if child_count > 0 {
        children.push(json!({"block_type":22,"divider":{}}));
    }
    for line in report
        .content_markdown
        .lines()
        .filter(|line| !line.trim().is_empty())
        .take(80)
    {
        let (block_type, key, content) = if let Some(value) = line.strip_prefix("## ") {
            (4, "heading2", value)
        } else if let Some(value) = line.strip_prefix("# ") {
            (3, "heading1", value)
        } else if let Some(value) = line.strip_prefix("- ") {
            (12, "bullet", value)
        } else {
            (2, "text", line)
        };
        let rich_text = json!({"elements":[{"text_run":{"content":content,"text_element_style":{}}}],"style":{}});
        let mut block = Map::new();
        block.insert("block_type".into(), json!(block_type));
        block.insert(key.into(), rich_text);
        children.push(Value::Object(block));
    }
    let create_url = format!("https://open.feishu.cn/open-apis/docx/v1/documents/{0}/blocks/{0}/children?document_revision_id=-1", document_id);
    lark_json(
        client
            .post(create_url)
            .bearer_auth(&token)
            .json(&json!({"children":children,"index":child_count})),
    )
    .await?;
    Ok(())
}

fn task_fields(task: &Task, primary: &str) -> Map<String, Value> {
    let mut fields = Map::new();
    fields.insert(primary.into(), json!(task.title));
    fields.insert("Cadence ID".into(), json!(task.id));
    fields.insert("状态".into(), json!(task.status));
    fields.insert("DDL".into(), json!(task.due_at.clone().unwrap_or_default()));
    fields.insert(
        "完成时间".into(),
        json!(task.completed_at.clone().unwrap_or_default()),
    );
    fields.insert("优先级".into(), json!(task.priority));
    fields.insert("标签".into(), json!(task.tags.join(", ")));
    fields.insert("备注".into(), json!(task.notes.clone().unwrap_or_default()));
    fields.insert("来源".into(), json!(task.source_type));
    fields.insert("本地更新时间".into(), json!(task.updated_at));
    fields.insert("Cadence 版本".into(), json!(task.version.to_string()));
    fields
}

pub async fn enhance_weekly(settings: &AppSettings, markdown: &str) -> Result<String, String> {
    let (base_url, key) = ai_config(settings)?;
    let model = configured_model(&settings.ai_text_model, "文本")?;
    let endpoint = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let system = format!(
        "{}\n\n你是简洁、具体的个人工作复盘助手。保留输入中的真实数据和 Markdown 结构，不虚构成果；补充本周节奏观察和最多三条可执行的下周建议。只返回 Markdown。",
        mimo_system_prompt(&chrono::Local::now())
    );
    let response=reqwest::Client::new().post(endpoint).bearer_auth(key).timeout(std::time::Duration::from_secs(60)).json(&json!({"model":model,"temperature":0.3,"messages":[{"role":"system","content":system},{"role":"user","content":markdown}]})).send().await.map_err(|error|format!("AI 请求失败：{}",error))?;
    let status = response.status();
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("AI 响应不是 JSON：{}", error))?;
    if !status.is_success() {
        return Err(format!("AI 服务返回 {}：{}", status, payload));
    }
    payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "AI 响应缺少周总结内容".into())
}

pub async fn analyze_text(settings: &AppSettings, content: &str) -> Result<Vec<TaskDraft>, String> {
    if ai_base_url(settings).is_none() {
        return Ok(content
            .lines()
            .flat_map(|line| line.split('；'))
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .take(8)
            .map(|line| {
                parse_task(
                    line,
                    settings.default_due_hour,
                    Some(content.chars().take(4000).collect()),
                )
            })
            .collect());
    }
    let model = configured_model(&settings.ai_text_model, "文本")?;
    call_ai(
        settings,
        &model,
        json!({"role":"user","content":content.chars().take(30000).collect::<String>()}),
    )
    .await
}

pub async fn analyze_image(
    settings: &AppSettings,
    data_url: &str,
) -> Result<Vec<TaskDraft>, String> {
    if ai_base_url(settings).is_none() {
        return Err("尚未配置模型服务地址，请在设置界面填写 AI 服务地址".into());
    }
    let model = configured_model(&settings.ai_vision_model, "视觉")?;
    call_ai(settings, &model, json!({"role":"user","content":[{"type":"text","text":"识别图片中属于用户的待办事项、明确截止时间、优先级和标签。优先级请返回 high、normal 或 low；没有明确优先级时返回 normal。"},{"type":"image_url","image_url":{"url":data_url}}]})).await
}

pub async fn parse_manual_task(
    settings: &AppSettings,
    raw_input: &str,
    source_excerpt: Option<String>,
) -> Result<TaskDraft, String> {
    let now = chrono::Local::now();
    let model = configured_model(&settings.ai_text_model, "文本")?;
    let drafts = call_ai_with_system(
        settings,
        &model,
        manual_task_prompt(now, settings.default_due_hour),
        json!({"role":"user","content":raw_input.trim()}),
    )
    .await?;

    if drafts.len() != 1 {
        return Err("模型没有返回唯一的任务，请换一种更明确的写法后重试".into());
    }

    let mut draft = drafts.into_iter().next().expect("checked task count");
    if draft.title.trim().is_empty() {
        return Err("模型未返回任务标题，请重试".into());
    }
    draft.title = draft.title.trim().to_string();
    if let Some(due_at) = draft.due_at.as_deref() {
        let parsed = chrono::DateTime::parse_from_rfc3339(due_at)
            .map_err(|_| "模型返回的截止时间不是 RFC3339 格式，请重试".to_string())?;
        draft.due_at = Some(parsed.to_rfc3339());
    }
    if !matches!(draft.priority.as_str(), "high" | "normal" | "low") {
        draft.priority = "normal".into();
    }
    draft.tags = draft
        .tags
        .into_iter()
        .map(|tag| tag.trim().trim_start_matches('#').to_string())
        .filter(|tag| !tag.is_empty())
        .collect();
    if draft.timezone.trim().is_empty() {
        draft.timezone = "Asia/Shanghai".into();
    }
    draft.source_excerpt = source_excerpt;
    Ok(draft)
}

fn manual_task_prompt(now: chrono::DateTime<chrono::Local>, default_due_hour: u8) -> String {
    format!(
        r#"{}

你是 Cadence 的快速记录解析器。把用户输入的唯一一条待办格式化为一个任务。

当前本地时间：{}；时区：Asia/Shanghai；未写具体时钟时的默认截止时间：{:02}:00。

严格执行：
1. 只返回 JSON，不要 Markdown、代码围栏、说明或额外文字。
2. 返回且仅返回一个任务，固定结构为 {{"tasks":[{{"title":"...","notes":null,"dueAt":"2026-07-25T15:00:00+08:00","timezone":"Asia/Shanghai","priority":"low|normal|high","tags":[],"sourceExcerpt":null,"confidence":0.95,"uncertainFields":[]}}]}}。没有日期或时间时，dueAt 改为 null。
3. 解析中文日期和时间（例如今天、明天、后天、周几、下周三、2026年7月25日、下午3点、今晚、15:30），并将 dueAt 规范化为带时区偏移的 RFC3339，例如 2026-07-25T15:00:00+08:00。
4. 只有日期但没有具体时钟时，使用默认截止时间；只有时钟但没有日期时，未过该时刻用今天，已过则用明天；没有任何日期或时间线索时 dueAt 必须为 null。
5. 仅根据输入判定优先级：!高、高优先级、紧急为 high；!低、低优先级、不紧急为 low；其余为 normal。不得臆造日期、时间、优先级或标签。
6. 从 title 中移除日期、时间、优先级和 #标签语法；tags 只收集明确的 #标签，且不带 #。不确定时在 uncertainFields 标明字段名。"#,
        mimo_system_prompt(&now),
        now.to_rfc3339(),
        default_due_hour
    )
}

async fn call_ai(
    settings: &AppSettings,
    model: &str,
    user_message: Value,
) -> Result<Vec<TaskDraft>, String> {
    let now = chrono::Local::now();
    let system = format!(
        r#"{}

你是 Cadence 的任务提取器。当前本地时间为 {}。只提取原文明确要求用户执行的任务，不要虚构日期。识别原文中的明确优先级；没有明确优先级时 priority 返回 normal。返回纯 JSON 数组，每项字段必须为 title, notes(null或字符串), dueAt(null或RFC3339), timezone(字符串), priority(low|normal|high), tags(字符串数组), sourceExcerpt(null), confidence(0到1), uncertainFields(字符串数组)。没有任务时返回 []。"#,
        mimo_system_prompt(&now),
        now.to_rfc3339()
    );
    call_ai_with_system(settings, model, system, user_message).await
}

async fn call_ai_with_system(
    settings: &AppSettings,
    model: &str,
    system: String,
    user_message: Value,
) -> Result<Vec<TaskDraft>, String> {
    let (base_url, key) = ai_config(settings)?;
    let endpoint = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let response = reqwest::Client::new().post(endpoint).bearer_auth(key).timeout(std::time::Duration::from_secs(60)).json(&json!({"model":model,"temperature":0.1,"messages":[{"role":"system","content":system},user_message]})).send().await.map_err(|error| format!("AI 请求失败：{}", error))?;
    let status = response.status();
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("AI 响应不是 JSON：{}", error))?;
    if !status.is_success() {
        return Err(format!("AI 服务返回 {}：{}", status, payload));
    }
    let content = payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| "AI 响应缺少内容".to_string())?;
    parse_drafts(content)
}

fn parse_drafts(content: &str) -> Result<Vec<TaskDraft>, String> {
    let cleaned = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let value: Value = serde_json::from_str(cleaned)
        .map_err(|error| format!("无法解析 AI 任务草稿：{}", error))?;
    let array = value.get("tasks").cloned().unwrap_or(value);
    serde_json::from_value(array).map_err(|error| format!("AI 草稿字段不完整：{}", error))
}

fn encode_screenshot(image: DynamicImage) -> Result<String, String> {
    let mut bytes = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Jpeg)
        .map_err(|error| error.to_string())?;
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes)))
}

pub fn capture_primary_screen() -> Result<String, String> {
    let monitor = Monitor::all()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|item| item.is_primary().unwrap_or(false))
        .ok_or_else(|| "未找到主显示器".to_string())?;
    let rgba = monitor.capture_image().map_err(|error| error.to_string())?;
    encode_screenshot(DynamicImage::ImageRgba8(rgba))
}

pub fn capture_primary_screen_region(
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let monitor = Monitor::all()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|item| item.is_primary().unwrap_or(false))
        .ok_or_else(|| "未找到主显示器".to_string())?;
    let rgba = monitor.capture_image().map_err(|error| error.to_string())?;
    let image = DynamicImage::ImageRgba8(rgba);
    if x >= image.width() || y >= image.height() {
        return Err("截图选区超出屏幕范围，请重新框选".into());
    }
    let width = width.min(image.width().saturating_sub(x));
    let height = height.min(image.height().saturating_sub(y));
    if width == 0 || height == 0 {
        return Err("截图选区无效，请重新框选".into());
    }
    encode_screenshot(image.crop_imm(x, y, width, height))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_fenced_json() {
        let result = parse_drafts("```json\n[{\"title\":\"交方案\",\"notes\":null,\"dueAt\":null,\"timezone\":\"Asia/Shanghai\",\"priority\":\"normal\",\"tags\":[],\"sourceExcerpt\":null,\"confidence\":0.9,\"uncertainFields\":[]}]\n```").unwrap();
        assert_eq!(result[0].title, "交方案");
    }

    #[test]
    fn manual_prompt_requires_a_single_json_task() {
        let prompt = manual_task_prompt(chrono::Local::now(), 18);
        assert!(prompt.contains("\"tasks\""));
        assert!(prompt.contains("RFC3339"));
        assert!(prompt.contains("只返回 JSON"));
        assert!(prompt.contains(MIMO_IDENTITY));
        assert!(prompt.contains("你的知识截止日期是2024年12月"));
    }

    #[test]
    fn selects_text_and_vision_models_from_settings() {
        let mut settings = AppSettings::default();
        settings.ai_text_model = "text-model".into();
        settings.ai_vision_model = "vision-model".into();

        assert_eq!(
            configured_model(&settings.ai_text_model, "文本").unwrap(),
            "text-model"
        );
        assert_eq!(
            configured_model(&settings.ai_vision_model, "视觉").unwrap(),
            "vision-model"
        );
    }
}
