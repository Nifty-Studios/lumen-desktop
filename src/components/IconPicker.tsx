import { useMemo, useState } from "react";
import { ICON_COLORS, PAGE_ICON_NAMES, iconColor, type IconColor, type IconName } from "@lumen/shared/icons";
import type { Icon as PageIcon } from "@lumen/shared";
import { useAmbient } from "../ambient/AmbientProvider";
import { Icon } from "./Icon";
import { Popover } from "./ui";

interface Props {
  anchor: HTMLElement | null;
  current: { name: IconName; color?: string | undefined } | null;
  onPick: (icon: PageIcon | null) => void;
  onClose: () => void;
}

export function IconPicker({ anchor, current, onPick, onClose }: Props) {
  const { theme } = useAmbient();
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<IconColor>((current?.color as IconColor) ?? "default");
  const names = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "-");
    return q ? PAGE_ICON_NAMES.filter((n) => n.includes(q)) : PAGE_ICON_NAMES;
  }, [query]);
  const pick = (name: IconName, c = color) => onPick({ type: "icon", name, ...(c !== "default" ? { color: c } : {}) });

  return (
    <Popover anchor={anchor} onClose={onClose} width={344}>
      <div className="flex items-center gap-2 px-2 pt-1.5 pb-2">
        <Icon name="search" size={15} className="text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find an icon"
          className="flex-1 bg-transparent text-[13.5px] placeholder:text-faint"
        />
        {current && (
          <button className="rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-hover" onClick={() => onPick(null)}>
            Remove
          </button>
        )}
      </div>
      <div className="flex gap-1.5 px-2 pb-2">
        {ICON_COLORS.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => {
              setColor(c);
              if (current) pick(current.name, c);
            }}
            className="grid h-6 w-6 place-items-center rounded-full transition-transform hover:scale-110"
            style={{ background: c === "default" ? theme.text : iconColor(c, theme.dark) }}
          >
            {c === color && <Icon name="check" size={13} strokeWidth={2.5} color={theme.dark ? "#111" : "#fff"} />}
          </button>
        ))}
      </div>
      <div className="grid max-h-64 grid-cols-8 gap-0.5 overflow-y-auto px-1 pb-1">
        {names.map((name) => (
          <button
            key={name}
            title={name.replace(/-/g, " ")}
            onClick={() => pick(name)}
            className={`grid aspect-square place-items-center rounded-xl transition-colors hover:bg-hover ${current?.name === name ? "bg-hover" : ""}`}
          >
            <Icon name={name} size={20} color={iconColor(color, theme.dark)} />
          </button>
        ))}
        {!names.length && <div className="col-span-8 py-6 text-center text-[13px] text-muted">No icons match</div>}
      </div>
    </Popover>
  );
}
