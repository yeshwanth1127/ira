mod db;

use db::{default_db_path, ensure_conversation, migrate, now_ms, open_db};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    Ok(default_db_path(base))
}

fn with_conn<T>(app: &tauri::AppHandle, f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
    let db_path = get_db_path(app)?;
    let conn = open_db(&db_path)?;
    f(&conn)
}

#[tauri::command]
fn start_conversation(app: tauri::AppHandle, title: Option<String>) -> Result<String, String> {
    with_conn(&app, |conn| {
        let id = Uuid::new_v4().to_string();
        let ts = now_ms();
        conn.execute(
            r#"
            INSERT INTO conversations(id, title, created_at, updated_at, archived_at, pinned_memory)
            VALUES (?1, ?2, ?3, ?3, NULL, NULL)
            "#,
            params![id, title, ts],
        )
        .map_err(|e| format!("insert conversation: {e}"))?;
        Ok(id)
    })
}

#[tauri::command]
fn append_message(
    app: tauri::AppHandle,
    conversation_id: String,
    role: String,
    content: String,
    client_message_id: Option<String>,
    parent_message_id: Option<String>,
    metadata: Option<serde_json::Value>,
) -> Result<String, String> {
    with_conn(&app, |conn| {
        ensure_conversation(conn, &conversation_id)?;
        let id = Uuid::new_v4().to_string();
        let ts = now_ms();
        let metadata_str = metadata.map(|v| v.to_string());
        conn.execute(
            r#"
            INSERT INTO messages(
              id, conversation_id, role, content, created_at, client_message_id, parent_message_id, metadata
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                id,
                conversation_id,
                role,
                content,
                ts,
                client_message_id,
                parent_message_id,
                metadata_str
            ],
        )
        .map_err(|e| format!("insert message: {e}"))?;

        conn.execute(
            "UPDATE conversations SET updated_at=?2 WHERE id=?1",
            params![conversation_id, ts],
        )
        .map_err(|e| format!("touch conversation: {e}"))?;

        Ok(id)
    })
}

#[tauri::command]
fn list_conversations(app: tauri::AppHandle, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<serde_json::Value>, String> {
    let limit = limit.unwrap_or(50).clamp(1, 200);
    let offset = offset.unwrap_or(0).max(0);
    with_conn(&app, |conn| {
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, title, created_at, updated_at, archived_at
                FROM conversations
                WHERE archived_at IS NULL
                ORDER BY updated_at DESC
                LIMIT ?1 OFFSET ?2
                "#,
            )
            .map_err(|e| format!("prepare list conversations: {e}"))?;

        let rows = stmt
            .query_map(params![limit, offset], |r| {
                Ok(serde_json::json!({
                    "id": r.get::<_, String>(0)?,
                    "title": r.get::<_, Option<String>>(1)?,
                    "created_at": r.get::<_, i64>(2)?,
                    "updated_at": r.get::<_, i64>(3)?,
                    "archived_at": r.get::<_, Option<i64>>(4)?,
                }))
            })
            .map_err(|e| format!("query list conversations: {e}"))?;

        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("row: {e}"))?);
        }
        Ok(out)
    })
}

#[tauri::command]
fn get_conversation_messages(app: tauri::AppHandle, conversation_id: String, limit: Option<i64>) -> Result<Vec<serde_json::Value>, String> {
    let limit = limit.unwrap_or(200).clamp(1, 500);
    with_conn(&app, |conn| {
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, role, content, created_at, client_message_id, parent_message_id, metadata
                FROM messages
                WHERE conversation_id = ?1
                ORDER BY created_at DESC
                LIMIT ?2
                "#,
            )
            .map_err(|e| format!("prepare messages: {e}"))?;

        let rows = stmt
            .query_map(params![conversation_id, limit], |r| {
                let metadata_str: Option<String> = r.get(6)?;
                let metadata_json = metadata_str
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
                Ok(serde_json::json!({
                    "id": r.get::<_, String>(0)?,
                    "role": r.get::<_, String>(1)?,
                    "content": r.get::<_, String>(2)?,
                    "created_at": r.get::<_, i64>(3)?,
                    "client_message_id": r.get::<_, Option<String>>(4)?,
                    "parent_message_id": r.get::<_, Option<String>>(5)?,
                    "metadata": metadata_json,
                }))
            })
            .map_err(|e| format!("query messages: {e}"))?;

        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("row: {e}"))?);
        }
        Ok(out)
    })
}

#[tauri::command]
fn build_context(app: tauri::AppHandle, conversation_id: String, max_recent: Option<i64>) -> Result<Vec<ChatMessage>, String> {
    let max_recent = max_recent.unwrap_or(20).clamp(1, 100);
    with_conn(&app, |conn| {
        // pinned memory + summary (as system) + recent messages (oldest->newest)
        let pinned: Option<String> = conn
            .query_row(
                "SELECT pinned_memory FROM conversations WHERE id=?1",
                params![conversation_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| format!("read pinned_memory: {e}"))?
            .flatten();

        let summary: Option<String> = conn
            .query_row(
                "SELECT summary_text FROM summaries WHERE conversation_id=?1",
                params![conversation_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| format!("read summary: {e}"))?;

        let mut out: Vec<ChatMessage> = Vec::new();

        if let Some(pinned_json) = pinned {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&pinned_json) {
                out.push(ChatMessage {
                    role: "system".to_string(),
                    content: format!("Pinned memory (JSON): {}", v),
                });
            } else {
                out.push(ChatMessage {
                    role: "system".to_string(),
                    content: format!("Pinned memory: {}", pinned_json),
                });
            }
        }

        if let Some(s) = summary {
            out.push(ChatMessage {
                role: "system".to_string(),
                content: format!("Conversation so far: {}", s),
            });
        }

        let mut stmt = conn
            .prepare(
                r#"
                SELECT role, content
                FROM messages
                WHERE conversation_id=?1
                ORDER BY created_at DESC
                LIMIT ?2
                "#,
            )
            .map_err(|e| format!("prepare recent: {e}"))?;

        let rows = stmt
            .query_map(params![conversation_id, max_recent], |r| {
                Ok(ChatMessage {
                    role: r.get::<_, String>(0)?,
                    content: r.get::<_, String>(1)?,
                })
            })
            .map_err(|e| format!("query recent: {e}"))?;

        let mut recent: Vec<ChatMessage> = Vec::new();
        for row in rows {
            recent.push(row.map_err(|e| format!("row: {e}"))?);
        }
        recent.reverse();
        out.extend(recent);
        Ok(out)
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmCallStart {
    pub conversation_id: String,
    pub request_messages: serde_json::Value,
    pub model: String,
    pub temperature: Option<f64>,
}

#[tauri::command]
fn log_llm_call_start(app: tauri::AppHandle, payload: LlmCallStart) -> Result<String, String> {
    with_conn(&app, |conn| {
        ensure_conversation(conn, &payload.conversation_id)?;
        let id = Uuid::new_v4().to_string();
        let ts = now_ms();
        conn.execute(
            r#"
            INSERT INTO llm_calls(
              id, conversation_id, request_messages, model, temperature, started_at, finished_at, status, error, usage, assistant_message_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 'ok', NULL, NULL, NULL)
            "#,
            params![
                id,
                payload.conversation_id,
                payload.request_messages.to_string(),
                payload.model,
                payload.temperature,
                ts
            ],
        )
        .map_err(|e| format!("insert llm_call start: {e}"))?;
        Ok(id)
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmCallFinish {
    pub llm_call_id: String,
    pub status: String, // ok|error|cancelled
    pub error: Option<String>,
    pub usage: Option<serde_json::Value>,
    pub assistant_message_id: Option<String>,
}

#[tauri::command]
fn log_llm_call_finish(app: tauri::AppHandle, payload: LlmCallFinish) -> Result<(), String> {
    with_conn(&app, |conn| {
        let ts = now_ms();
        conn.execute(
            r#"
            UPDATE llm_calls
            SET finished_at=?2, status=?3, error=?4, usage=?5, assistant_message_id=?6
            WHERE id=?1
            "#,
            params![
                payload.llm_call_id,
                ts,
                payload.status,
                payload.error,
                payload.usage.map(|v| v.to_string()),
                payload.assistant_message_id
            ],
        )
        .map_err(|e| format!("update llm_call finish: {e}"))?;
        Ok(())
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = get_db_path(&app.handle())?;
            let conn = open_db(&db_path)?;
            migrate(&conn)?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_conversation,
            append_message,
            list_conversations,
            get_conversation_messages,
            build_context,
            log_llm_call_start,
            log_llm_call_finish
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
