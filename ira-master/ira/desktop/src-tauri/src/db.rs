use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn open_db(db_path: &Path) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create db dir: {e}"))?;
    }

    let conn = Connection::open(db_path).map_err(|e| format!("open sqlite: {e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("set WAL: {e}"))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("enable FK: {e}"))?;
    Ok(conn)
}

pub fn default_db_path(app_data_dir: PathBuf) -> PathBuf {
    app_data_dir.join("ira").join("ira.sqlite")
}

pub fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL
        );
        "#,
    )
    .map_err(|e| format!("create schema_migrations: {e}"))?;

    let current: i64 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_migrations", [], |r| r.get(0))
        .map_err(|e| format!("read migration version: {e}"))?;

    if current < 1 {
        conn.execute_batch(
            r#"
            CREATE TABLE conversations (
              id TEXT PRIMARY KEY,
              title TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              archived_at INTEGER,
              pinned_memory TEXT
            );

            CREATE TABLE messages (
              id TEXT PRIMARY KEY,
              conversation_id TEXT NOT NULL,
              role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
              content TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              client_message_id TEXT,
              parent_message_id TEXT,
              metadata TEXT,
              FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE INDEX idx_messages_conv_created_at
              ON messages(conversation_id, created_at);

            CREATE UNIQUE INDEX idx_messages_conv_client_msg_id
              ON messages(conversation_id, client_message_id)
              WHERE client_message_id IS NOT NULL;

            CREATE TABLE llm_calls (
              id TEXT PRIMARY KEY,
              conversation_id TEXT NOT NULL,
              request_messages TEXT NOT NULL,
              model TEXT NOT NULL,
              temperature REAL,
              started_at INTEGER NOT NULL,
              finished_at INTEGER,
              status TEXT NOT NULL CHECK (status IN ('ok','error','cancelled')),
              error TEXT,
              usage TEXT,
              assistant_message_id TEXT,
              FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE INDEX idx_llm_calls_conv_started_at
              ON llm_calls(conversation_id, started_at);

            CREATE TABLE summaries (
              conversation_id TEXT PRIMARY KEY,
              summary_text TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              up_to_message_created_at INTEGER NOT NULL,
              FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE TABLE events (
              id TEXT PRIMARY KEY,
              conversation_id TEXT,
              type TEXT NOT NULL,
              payload TEXT,
              created_at INTEGER NOT NULL,
              FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE INDEX idx_events_created_at
              ON events(created_at);

            INSERT INTO schema_migrations(version, applied_at) VALUES (1, strftime('%s','now') * 1000);
            "#,
        )
        .map_err(|e| format!("apply migration v1: {e}"))?;
    }

    Ok(())
}

pub fn ensure_conversation(conn: &Connection, conversation_id: &str) -> Result<(), String> {
    let ts = now_ms();
    conn.execute(
        r#"
        INSERT INTO conversations(id, title, created_at, updated_at, archived_at, pinned_memory)
        VALUES (?1, NULL, ?2, ?2, NULL, NULL)
        ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at
        "#,
        params![conversation_id, ts],
    )
    .map_err(|e| format!("ensure conversation: {e}"))?;
    Ok(())
}

