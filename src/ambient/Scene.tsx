// The theme's drawings (see @lumen/shared/scenes). A theme dresses the whole window: far
// silhouettes behind the glass, a piece hanging from the top, a band across the top of the
// sidebar and a vignette at its foot, a tall piece up the right side of the page with the
// ground along its bottom, and somebody sitting on top of each dialog. They are redrawn only
// when the light, the weather, the day or the accent really changes, so their little
// animations are not restarted every minute.

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import {
  sceneBackdrop,
  sceneCorner,
  sceneCrest,
  sceneFloor,
  sceneLook,
  sceneOverhead,
  scenePerch,
  sceneRail,
  SCENE_CORNER,
  SCENE_CREST,
  SCENE_FLOOR_HEIGHT,
  SCENE_OVERHEAD_HEIGHT,
  SCENE_PERCH,
  SCENE_RAIL_WIDTH,
  type SceneId,
  type SceneLook,
} from "@lumen/shared/scenes";
import { useAmbient } from "./AmbientProvider";
import "./Scene.css";
import "./SceneSkin.css";

/** The moment as the drawings see it, steady between real changes. */
function useLook(): { scene: SceneId | null; look: SceneLook; key: string } {
  const { sky, theme, settings, celebration } = useAmbient();
  const live = sceneLook(sky, theme, settings.motion !== "still", { celebration: celebration?.celebration.id ?? null, latitude: settings.location?.lat });
  const daylight = Math.round(live.daylight * 20) / 20;
  // The sky colors only matter to the backdrop and the window, so they are left out of `key`:
  // dusk does not redraw the lamps and the fox.
  const key = `${live.dark}|${daylight}|${live.snow}|${live.rain}|${live.storm}|${live.accent}|${live.animated}|${live.celebration}|${live.season}|${live.month}-${live.day}`;
  const skyKey = live.sky.join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const look = useMemo(() => ({ ...live, daylight }), [key, skyKey]);
  return { scene: settings.scene, look, key };
}

const LIGHTS = "lumen.scene.lights";

/** Poking something in a drawing makes it jump; poking a lamp, a lantern or a sign switches the lights. */
function poke(e: MouseEvent) {
  const el = (e.target as Element).closest<SVGElement>("[data-poke]");
  if (!el) return;
  el.classList.remove("is-poked");
  void el.getBoundingClientRect();
  el.classList.add("is-poked");
  if (el.dataset.poke === "light") {
    const root = document.documentElement;
    const off = root.dataset.lights !== "off";
    if (off) root.dataset.lights = "off";
    else delete root.dataset.lights;
    try {
      localStorage.setItem(LIGHTS, off ? "off" : "on");
    } catch {
      // Private mode: the lights just come back on next time.
    }
  }
}

const Art = memo(function Art({ svg, className, style }: { svg: string; className: string; style?: CSSProperties }) {
  return (
    <div
      className={className}
      style={style}
      aria-hidden
      onClick={poke}
      onAnimationEnd={(e) => e.animationName === "lm-poke" && (e.target as Element).classList.remove("is-poked")}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});

/** Tells the stylesheet which theme is on, so every surface can dress for it. */
export function SceneRoot() {
  const { settings } = useAmbient();
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (settings.scene) root.dataset.scene = settings.scene;
    else delete root.dataset.scene;
    try {
      if (localStorage.getItem(LIGHTS) === "off") root.dataset.lights = "off";
    } catch {
      // No storage, no memory of the switch.
    }
  }, [settings.scene]);
  return null;
}

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

/** The band across the top of the sidebar. */
export function SceneCrest() {
  const { scene, look, key } = useLook();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const svg = useMemo(() => (scene ? sceneCrest(scene, look).svg : ""), [scene, key]);
  if (!scene) return null;
  return <Art key={scene} svg={svg} className="scene scene-crest" style={{ aspectRatio: `${SCENE_CREST.width} / ${SCENE_CREST.height}` }} />;
}

/** The vignette at the bottom of the sidebar. */
export function SceneCorner() {
  const { scene, look, key } = useLook();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const svg = useMemo(() => (scene ? sceneCorner(scene, look).svg : ""), [scene, key]);
  if (!scene) return null;
  return <Art key={scene} svg={svg} className="scene scene-corner" style={{ aspectRatio: `${SCENE_CORNER.width} / ${SCENE_CORNER.height}` }} />;
}

/** Width of the text column the page keeps clear (PageView's max width). */
const COLUMN = 760;
/** Its padding on each side. */
const GUTTER = 64;

/**
 * The page's share of the theme: the tall piece up its right side (when the window leaves
 * room beside the text) and the ground along its bottom. Goes inside the page sheet.
 */
export function ScenePage({ rail = true }: { rail?: boolean }) {
  const { scene, look, key } = useLook();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.round(el.clientWidth / 20) * 20, h: Math.round(el.clientHeight / 20) * 20 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scene]);

  // The text column moves over to share the page with the rail (see .scene-pad), so the
  // rail gets whatever lies right of the text itself.
  const railWidth = rail ? Math.max(0, Math.min(SCENE_RAIL_WIDTH, size.w - (COLUMN - GUTTER) - 20)) : 0;
  const scale = railWidth / SCENE_RAIL_WIDTH;
  const showRail = !!scene && railWidth >= 150 && size.h >= 380;
  useLayoutEffect(() => {
    const sheet = ref.current?.parentElement;
    sheet?.style.setProperty("--scene-rail", showRail ? `${railWidth}px` : "0px");
    return () => void sheet?.style.removeProperty("--scene-rail");
  }, [showRail, railWidth]);
  const railHeight = showRail ? Math.round(size.h / scale / 20) * 20 : 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const railSvg = useMemo(() => (scene && showRail ? sceneRail(scene, look, railHeight).svg : ""), [scene, key, look.sky.join(), railHeight, showRail]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const floorSvg = useMemo(() => (scene && size.w ? sceneFloor(scene, look, size.w).svg : ""), [scene, key, size.w]);
  if (!scene) return null;
  return (
    <div ref={ref} className="scene-page">
      {floorSvg && <Art key={`${scene}-floor`} svg={floorSvg} className="scene scene-floor" style={{ height: SCENE_FLOOR_HEIGHT }} />}
      {showRail && <Art key={`${scene}-rail`} svg={railSvg} className="scene scene-rail" style={{ width: railWidth }} />}
    </div>
  );
}

/**
 * Somebody sitting on top of a dialog. Put it in the scrim, right before the dialog: it
 * finds the dialog (its next sibling) and stands on its top edge.
 */
export function ScenePerch() {
  const { scene, look, key } = useLook();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const svg = useMemo(() => (scene ? scenePerch(scene, look).svg : ""), [scene, key]);
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ left: number; top: number }>();
  useLayoutEffect(() => {
    const dialog = [...(ref.current?.parentElement?.children ?? [])].find((el) => el.classList.contains("surface"));
    if (!scene || !dialog) return;
    const place = () => {
      const box = dialog.getBoundingClientRect();
      // No room above the dialog (a short window): nobody climbs up.
      setAt(box.top < SCENE_PERCH.height + 8 ? undefined : { left: Math.round(box.right - 46 - SCENE_PERCH.width), top: Math.round(box.top - SCENE_PERCH.height + 1) });
    };
    // After the dialog's pop-in has settled.
    const t = window.setTimeout(place, 180);
    const ro = new ResizeObserver(place);
    ro.observe(dialog);
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [scene]);
  if (!scene) return null;
  return (
    <>
      <span ref={ref} hidden />
      {at && <Art svg={svg} className="scene scene-perch" style={{ width: SCENE_PERCH.width, height: SCENE_PERCH.height, left: at.left, top: at.top }} />}
    </>
  );
}

/** A small still picture of a theme, for the picker in Settings. */
export function ScenePreview({ scene }: { scene: SceneId }) {
  const { look, key } = useLook();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const svg = useMemo(() => sceneCorner(scene, { ...look, animated: false }).svg, [scene, key]);
  return <Art svg={svg} className="scene scene-preview" />;
}
