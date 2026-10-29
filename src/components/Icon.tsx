import { createElement, type CSSProperties } from "react";
import { ICON_NODES, type IconName } from "@lumen/shared/icons";

interface Props {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  color?: string | undefined;
  className?: string;
  style?: CSSProperties;
}

/** An outline icon from the shared set (24x24, round 1.75px stroke by default). */
export function Icon({ name, size = 18, strokeWidth = 1.75, color, className, style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flex: "none", ...style }}
      aria-hidden
    >
      {(ICON_NODES[name] ?? []).map(([tag, { key: _, ...attrs }], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
