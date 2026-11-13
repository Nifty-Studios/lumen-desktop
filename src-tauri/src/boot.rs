//! Startup prefetch. Opening the window means waiting for WebView2 to start, which takes
//! far longer than SQLite needs to answer everything the first screen asks. So the webview
//! records which read-only queries it ran while starting (the "boot plan"), and on the next
//! launch Rust runs that plan on a background thread while the webview is still loading.
//! The answers are handed over in one call (`boot_take`), instead of dozens of round trips
//! after the page is up.
//!
//! Only SELECTs are ever run from the plan, and the webview drops
//! them the moment it writes anything, so a prefetched answer is never staler than a query
//! made at the same instant.

use std::path::PathBuf;
use std::sync::Mutex;
use std::thread::JoinHandle;

use serde::{Deserialize, Serialize};
use serde_json::Value as Json;
use tauri::{AppHandle, Manager};

use crate::db::{self, Db, Query};

const PLAN_FILE: &str = "boot-plan.json";
const MAX_QUERIES: usize = 160;
/// Stop prefetching once the answers add up to this much JSON (bytes, roughly).
const MAX_BYTES: usize = 3 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
pub struct Planned {
    /// The webview's own name for the query (it gets it back with the answer).
    key: String,
    #[serde(flatten)]
    query: Query,
}

#[derive(Serialize)]
pub struct Answer {
    key: String,
    rows: Json,
}

pub struct Boot {
    worker: Mutex<Option<JoinHandle<Vec<Answer>>>>,
    plan_path: PathBuf,
}

fn is_select(sql: &str) -> bool {
    let sql = sql.trim_start();
    sql.len() >= 6 && sql[..6].eq_ignore_ascii_case("select") && !sql.contains(';')
}

impl Boot {
    /// Starts running the saved plan. Call after the database is managed.
    pub fn start(app: &AppHandle, dir: &std::path::Path) -> Self {
        let plan_path = dir.join(PLAN_FILE);
        let plan: Vec<Planned> = std::fs::read(&plan_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let app = app.clone();
        let worker = std::thread::spawn(move || {
            let db = app.state::<Db>();
            let Ok(conn) = db.0.lock() else { return Vec::new() };
            let mut answers = Vec::with_capacity(plan.len());
            let mut bytes = 0;
            for planned in plan.into_iter().take(MAX_QUERIES) {
                if !is_select(planned.query.sql()) || planned.query.method() == "run" {
                    continue;
                }
                // A query that no longer fits the schema (after an update) is simply skipped.
                let Ok(rows) = db::run(&conn, &planned.query) else { continue };
                bytes += rows.to_string().len();
                if bytes > MAX_BYTES {
                    break;
                }
                answers.push(Answer { key: planned.key, rows });
            }
            answers
        });
        Self { worker: Mutex::new(Some(worker)), plan_path }
    }
}

/// The prefetched answers, once. Later calls (a reload) get nothing and query as usual.
#[tauri::command(async)]
pub fn boot_take(boot: tauri::State<'_, Boot>) -> Vec<Answer> {
    let worker = boot.worker.lock().ok().and_then(|mut w| w.take());
    worker.and_then(|w| w.join().ok()).unwrap_or_default()
}

/// Saves what this launch read while starting, for the next launch to prefetch.
#[tauri::command(async)]
pub fn boot_plan(boot: tauri::State<'_, Boot>, queries: Vec<Planned>) -> Result<(), String> {
    let plan: Vec<&Planned> = queries.iter().filter(|p| is_select(p.query.sql())).take(MAX_QUERIES).collect();
    let bytes = serde_json::to_vec(&plan).map_err(|e| e.to_string())?;
    std::fs::write(&boot.plan_path, bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::is_select;

    #[test]
    fn only_plain_selects_are_prefetched() {
        assert!(is_select("select \"key\" from \"meta\""));
        assert!(is_select("  SELECT 1"));
        assert!(!is_select("delete from meta"));
        assert!(!is_select("select 1; delete from meta"));
        assert!(!is_select("with t as (select 1) delete from meta"));
        assert!(!is_select("sel"));
    }
}
