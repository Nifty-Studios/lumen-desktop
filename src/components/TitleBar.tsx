import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { IconName } from "@lumen/shared/icons";
import { Icon } from "./Icon";

/**
 * The window has no system title bar (`decorations: false`), so this strip across the top is
 * the handle for dragging (double-click maximizes), with minimize, maximize and close on the right.
 */
export function TitleBar() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void win.isMaximized().then(setMaximized);
    const off = win.onResized(() => void win.isMaximized().then(setMaximized));
    return () => void off.then((f) => f());
  }, [win]);

  return (
    <div data-tauri-drag-region className="fixed inset-x-0 top-0 z-[70] flex h-11 items-start justify-end p-1.5 select-none">
      <div className="flex overflow-hidden rounded-xl bg-glass shadow-[0_6px_20px_-10px_var(--shadow)] backdrop-blur-xl">
        <Control icon="minus" label="Minimize" onClick={() => win.minimize()} />
        <Control icon={maximized ? "copy" : "square"} label={maximized ? "Restore" : "Maximize"} onClick={() => win.toggleMaximize()} small />
        <Control icon="x" label="Close" onClick={() => win.close()} close />
      </div>
    </div>
  );
}

function Control({ icon, label, onClick, small, close }: { icon: IconName; label: string; onClick: () => void; small?: boolean; close?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-10 place-items-center text-muted transition-colors ${close ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-hover hover:text-fg"}`}
    >
      <Icon name={icon} size={small ? 12 : 15} strokeWidth={1.5} />
    </button>
  );
}
