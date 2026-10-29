// Where the sky is: Windows location services first, then a guess from the timezone.

import { invoke } from "@tauri-apps/api/core";
import { searchPlaces, timezoneCity, type SavedLocation } from "@lumen/shared/ambient";

const distanceKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/** The timezone's city ("Africa/Lagos" -> Lagos), looked up once online. */
async function timezonePlace(): Promise<SavedLocation | undefined> {
  const city = timezoneCity();
  if (!city) return undefined;
  const [place] = await searchPlaces(city).catch(() => []);
  return place ? { lat: place.lat, lon: place.lon, label: place.name, source: "timezone" } : undefined;
}

/** The device's location (needs Windows location services), named after a nearby city when we can. */
export async function deviceLocation(): Promise<SavedLocation> {
  const pos = await invoke<{ lat: number; lon: number; accuracy: number }>("device_location");
  const near = await timezonePlace();
  const label = near && distanceKm(pos, near) < 120 ? near.label : "Current location";
  return { lat: pos.lat, lon: pos.lon, label, source: "device" };
}

/** Device location if allowed, otherwise the timezone's city, otherwise undefined. */
export async function bestLocation(): Promise<SavedLocation | undefined> {
  try {
    return await deviceLocation();
  } catch {
    return timezonePlace();
  }
}
