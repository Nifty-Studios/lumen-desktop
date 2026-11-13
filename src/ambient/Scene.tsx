// The theme's drawings (see @lumen/shared/scenes): silhouettes behind the glass, a piece
// hanging from the top of the window, and a vignette at the bottom of the sidebar. They are
// redrawn only when the light, the weather or the accent really changes, so their little
// animations are not restarted every minute.

import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import { sceneBackdrop, sceneCorner, sceneLook, sceneOverhead, SCENE_CORNER, SCENE_OVERHEAD_HEIGHT, type SceneId, type SceneLook } from "@lumen/shared/scenes";
import { useAmbient } from "./AmbientProvider";
import "./Scene.css";

/** The moment as the drawings see it, steady between real changes. */
function useLook(): { scene: SceneId | null; look: SceneLook; key: string } {
  const { sky, theme, settings } = useAmbient();
  const live = sceneLook(sky, theme, settings.motion !== "still");
  const daylight = Math.round(live.daylight * 20) / 20;
  // The sky colors only matter to the backdrop, so they are left out of `key`: dusk does not
  // redraw the lamps and the fox.
  const key = `${live.dark}|${daylight}|${live.snow}|${live.rain}|${live.accent}|${live.animated}`;
  const skyKey = live.sky.join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const look = useMemo(() => ({ ...live, daylight }), [key, skyKey]);
  return { scene: settings.scene, look, key };
}

const Art = memo(function Art({ svg, className, style }: { svg: string; className: string; style?: CSSProperties }) {
  return <div className={className} style={style} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
});

/** Far silhouettes, inside the sky (rain and snow fall in front of them). */
export function SceneBackdrop() {
  const { scene, look } = useLook();
  const svg = useMemo(() => (scene ? sceneBackdrop(scene, look).svg : ""), [scene, look]);
  if (!scene) return null;
  return <Art key={scene} svg={svg} className="scene scene-backdrop" />;
}

function useWindowWidth(step: number) {
  const [width, setWidth] = useState(() => Math.ceil(window.innerWidth / step) * step);
  useEffect(() => {
    const on = () => setWidth(Math.ceil(window.innerWidth / step) * step);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [step]);
  return width;
}

/** Hangs from the top edge of the window, a little in front of the glass. */
export function SceneOverhead() {
  const { scene, look, key } = useLook();
  const width = useWindowWidth(60);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const svg = useMemo(() => (scene ? sceneOverhead(scene, look, width).svg : ""), [scene, key, width]);
  if (!scene) return null;
  return <Art key={scene} svg={svg} className="scene scene-overhead" style={{ height: SCENE_OVERHEAD_HEIGHT }} />;
}

/** The vignette at the bottom of the sidebar. */
export function SceneCorner() {
  const { scene, look, key } = useLook();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const svg = useMemo(() => (scene ? sceneCorner(scene, look).svg : ""), [scene, key]);
  if (!scene) return null;
  return <Art key={scene} svg={svg} className="scene scene-corner" style={{ aspectRatio: `${SCENE_CORNER.width} / ${SCENE_CORNER.height}` }} />;
}

/** A small still picture of a theme, for the picker in Settings. */
export function ScenePreview({ scene }: { scene: SceneId }) {
  const { look, key } = useLook();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const svg = useMemo(() => sceneCorner(scene, { ...look, animated: false }).svg, [scene, key]);
  return <Art svg={svg} className="scene scene-preview" />;
}
