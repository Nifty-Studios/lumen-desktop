//! Small native helpers for the webview: the device's location (for the live sky) and
//! writing exported files the user picked a path for.

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};

#[derive(Serialize)]
pub struct Location {
    lat: f64,
    lon: f64,
    /// Meters.
    accuracy: f64,
}

/// The device's position from Windows location services. WebView2's own geolocation
/// never answers inside Tauri (its permission prompt has nowhere to show).
#[tauri::command]
pub async fn device_location() -> Result<Location, String> {
    tauri::async_runtime::spawn_blocking(locate)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn locate() -> Result<Location, String> {
    use windows::Devices::Geolocation::{GeolocationAccessStatus, Geolocator, PositionAccuracy};

    let err = |e: windows::core::Error| e.message().to_string();
    let access = Geolocator::RequestAccessAsync().map_err(err)?.join().map_err(err)?;
    if access != GeolocationAccessStatus::Allowed {
        return Err("Location access is turned off in Windows settings".into());
    }
    let locator = Geolocator::new().map_err(err)?;
    locator.SetDesiredAccuracy(PositionAccuracy::Default).map_err(err)?;
    let position = locator.GetGeopositionAsync().map_err(err)?.join().map_err(err)?;
    let coordinate = position.Coordinate().map_err(err)?;
    let point = coordinate.Point().map_err(err)?.Position().map_err(err)?;
    Ok(Location {
        lat: point.Latitude,
        lon: point.Longitude,
        accuracy: coordinate.Accuracy().map_err(err)?,
    })
}

#[cfg(not(windows))]
fn locate() -> Result<Location, String> {
    Err("Device location is only available on Windows".into())
}

/// Writes the raw request body to the path in the `x-path` header (URI-encoded). The path
/// comes from the save dialog, so the user chose it.
#[tauri::command]
pub fn save_file(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let path = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing x-path header")?;
    let path = percent_decode(path);
    std::fs::write(&path, bytes).map_err(|e| format!("Could not save {path}: {e}"))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
