//! SQLite bridge for the webview. The frontend builds SQL with Drizzle (sqlite-proxy
//! driver) and sends it here. A single connection behind a mutex means a batch runs as
//! one real transaction.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::types::{Value, ValueRef};
use rusqlite::{Connection, params_from_iter};
use serde::Deserialize;
use serde_json::Value as Json;

pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;
        Ok(Self(Mutex::new(conn)))
    }
}

#[derive(Deserialize)]
pub struct Query {
    sql: String,
    #[serde(default)]
    params: Vec<Json>,
    /// Drizzle proxy method: "run" | "all" | "values" | "get".
    #[serde(default = "default_method")]
    method: String,
}

fn default_method() -> String {
    "all".into()
}

fn to_sql(v: &Json) -> Value {
    match v {
        Json::Null => Value::Null,
        Json::Bool(b) => Value::Integer(*b as i64),
        Json::Number(n) => n
            .as_i64()
            .map(Value::Integer)
            .unwrap_or_else(|| Value::Real(n.as_f64().unwrap_or(0.0))),
        Json::String(s) => Value::Text(s.clone()),
        other => Value::Text(other.to_string()),
    }
}

fn to_json(v: ValueRef) -> Json {
    match v {
        ValueRef::Null => Json::Null,
        ValueRef::Integer(i) => i.into(),
        ValueRef::Real(f) => f.into(),
        ValueRef::Text(t) => String::from_utf8_lossy(t).into_owned().into(),
        ValueRef::Blob(b) => b.to_vec().into(),
    }
}

/// Runs one query. Rows come back as arrays of column values, which is what Drizzle's
/// proxy driver expects; "get" returns the first row (or null).
fn run(conn: &Connection, q: &Query) -> rusqlite::Result<Json> {
    let mut stmt = conn.prepare_cached(&q.sql)?;
    let columns = stmt.column_count();
    let mut rows = stmt.query(params_from_iter(q.params.iter().map(to_sql)))?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let values = (0..columns).map(|i| row.get_ref(i).map(to_json)).collect::<rusqlite::Result<Vec<_>>>()?;
        out.push(Json::Array(values));
        if q.method == "get" {
            break;
        }
    }
    Ok(match q.method.as_str() {
        "run" => Json::Array(vec![]),
        "get" => out.into_iter().next().unwrap_or(Json::Null),
        _ => Json::Array(out),
    })
}

#[tauri::command]
pub fn db_query(db: tauri::State<'_, Db>, sql: String, params: Vec<Json>, method: String) -> Result<Json, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    run(&conn, &Query { sql, params, method }).map_err(|e| e.to_string())
}

/// Runs all queries in one transaction; any failure rolls back the whole batch.
#[tauri::command]
pub fn db_batch(db: tauri::State<'_, Db>, queries: Vec<Query>) -> Result<Vec<Json>, String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut results = Vec::with_capacity(queries.len());
    for q in &queries {
        results.push(run(&tx, q).map_err(|e| format!("{e} in: {}", q.sql))?);
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(results)
}
