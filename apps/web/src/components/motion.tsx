import type { ReactNode } from "react";
import { LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from "motion/react";
import { isReducedMotion, revealMotion, type RevealKind } from "./motion-presets";

/**
 * T-711: motion wiring. LazyMotion + domAnimation keeps the bundle small; `strict` makes sure
 * only the light `m.*` components are used. Presentation only: no component here computes a state.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** True when the user asked for reduced motion (or the preference is still unknown). */
export function usePrefersReducedMotion(): boolean {
  return isReducedMotion(useReducedMotion());
}

const REVEAL_TAGS = {
  div: m.div,
  section: m.section,
  li: m.li,
} as const;

interface RevealProps {
  as?: keyof typeof REVEAL_TAGS;
  kind?: RevealKind;
  className?: string;
  children: ReactNode;
}

/** Soft entry when the element mounts. Change its `key` to play it again (section, indicator). */
export function Reveal({ as = "div", kind = "rise", className, children }: RevealProps) {
  const reduced = usePrefersReducedMotion();
  const Tag = REVEAL_TAGS[as];
  return (
    <Tag className={className} {...revealMotion(kind, reduced)}>
      {children}
    </Tag>
  );
}
