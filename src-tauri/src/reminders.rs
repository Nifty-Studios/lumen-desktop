//! Calendar reminders as scheduled Windows notifications. Windows itself shows them at their
//! time, so they arrive even when Lumen is closed. The webview hands over the next few days of
//! reminders whenever events change; each call replaces everything scheduled before.

use serde::Deserialize;

#[derive(Deserialize)]
pub struct Reminder {
    /// Epoch milliseconds.
    at: i64,
    title: String,
    body: String,
}

/// Replaces Lumen's scheduled notifications with these. Returns how many were scheduled, or an
/// error when Windows can't schedule for this build (a dev build has no Start menu identity);
/// the webview then tells reminders itself while it runs.
#[tauri::command]
pub async fn schedule_reminders(app: tauri::AppHandle, reminders: Vec<Reminder>) -> Result<usize, String> {
    let id = app.config().identifier.clone();
    tauri::async_runtime::spawn_blocking(move || schedule(&id, reminders))
        .await
        .map_err(|e| e.to_string())?
}

/// Installed copies run from their install folder; dev and local release builds from target\.
#[cfg(windows)]
fn installed() -> bool {
    let Ok(exe) = std::env::current_exe() else { return false };
    let dir = exe.parent().map(|d| d.display().to_string().to_lowercase()).unwrap_or_default();
    !(dir.ends_with("\\target\\debug") || dir.ends_with("\\target\\release"))
}

#[cfg(windows)]
fn schedule(app_id: &str, reminders: Vec<Reminder>) -> Result<usize, String> {
    use windows::core::HSTRING;
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::DateTime;
    use windows::UI::Notifications::{ScheduledToastNotification, ToastNotificationManager};

    if !installed() {
        return Err("not installed".into());
    }
    let err = |e: windows::core::Error| e.message().to_string();
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id)).map_err(err)?;
    for old in notifier.GetScheduledToastNotifications().map_err(err)? {
        let _ = notifier.RemoveFromSchedule(&old);
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let mut count = 0;
    for r in reminders.iter().filter(|r| r.at > now + 5_000).take(400) {
        let xml = format!(
            r#"<toast launch="lumen-reminder"><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual><audio src="ms-winsoundevent:Notification.Reminder"/></toast>"#,
            escape(&r.title),
            escape(&r.body)
        );
        let doc = XmlDocument::new().map_err(err)?;
        doc.LoadXml(&HSTRING::from(xml)).map_err(err)?;
        // DateTime counts 100 ns ticks from 1601-01-01.
        let when = DateTime { UniversalTime: (r.at + 11_644_473_600_000) * 10_000 };
        let toast = ScheduledToastNotification::CreateScheduledToastNotification(&doc, when).map_err(err)?;
        notifier.AddToSchedule(&toast).map_err(err)?;
        count += 1;
    }
    Ok(count)
}

#[cfg(not(windows))]
fn schedule(_app_id: &str, _reminders: Vec<Reminder>) -> Result<usize, String> {
    Err("not supported".into())
}

#[cfg(windows)]
fn escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}
