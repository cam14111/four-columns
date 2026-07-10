import { CSSProperties, ReactNode } from "react";

/**
 * Renders fixed-size content visually scaled by a CSS length factor while
 * keeping its layout box in sync (width/height shrink with the scale, so
 * surrounding flex layout stays honest).
 *
 * `scale` is any CSS expression resolving to a number — typically a var()
 * set from media queries — which lets the boards adapt to short viewports
 * purely in CSS. With `animate`, changes to the factor transition smoothly
 * (used for the face-to-face size swap).
 */
interface ScaledBoxProps {
  width: number;
  height: number;
  scale: string;
  animate?: boolean;
  children: ReactNode;
}

export const ScaledBox = ({
  width,
  height,
  scale,
  animate,
  children,
}: ScaledBoxProps) => (
  <div
    className={animate ? "face-swap" : undefined}
    style={
      {
        "--s": scale,
        width: `calc(${width}px * var(--s))`,
        height: `calc(${height}px * var(--s))`,
      } as CSSProperties
    }
  >
    <div
      className={animate ? "face-swap-inner" : undefined}
      style={{
        width,
        height,
        transform: "scale(var(--s))",
        transformOrigin: "top left",
      }}
    >
      {children}
    </div>
  </div>
);
