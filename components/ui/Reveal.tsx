"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  /** seconds to delay the animation — use for staggering siblings */
  delay?: number;
  /** distance travelled on the y axis, px */
  y?: number;
  /** run once when scrolled into view (default) or every time */
  once?: boolean;
  className?: string;
} & Omit<HTMLMotionProps<"div">, "children">;

/**
 * Slide-up + fade reveal. Fires when the element scrolls into view.
 * Shared by every section so the whole page shares one motion language.
 */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  once = true,
  className,
  ...rest
}: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px" }}
      transition={{
        duration: 0.7,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
