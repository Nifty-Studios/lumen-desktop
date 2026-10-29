// The Remotion animations (lumen-motion repo, rendered into public/motion): the welcome that
// plays once on first launch, and the mark shown while Lumen starts.

import { useEffect, useState } from "react";

export function WelcomeVideo({ onDone }: { onDone: () => void }) {
  return (
    <div className="animate-fade fixed inset-0 z-[70] bg-[#060816]">
      <video src="/motion/welcome.mp4" autoPlay muted playsInline onEnded={onDone} onError={onDone} className="h-full w-full object-cover" />
      <button
        onClick={onDone}
        className="absolute right-6 bottom-6 rounded-xl bg-white/10 px-4 py-2 text-[13px] text-white/80 backdrop-blur-md transition-colors hover:bg-white/20 hover:text-white"
      >
        Skip
      </button>
    </div>
  );
}

/** Shown only if starting takes a moment, so quick starts don't flash it. */
export function LoadingMark() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 250);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="grid h-full place-items-center bg-[#0b0c1a]">
      {show && <video src="/motion/loading.mp4" autoPlay loop muted playsInline className="animate-fade h-32 w-32 rounded-full" />}
    </div>
  );
}
