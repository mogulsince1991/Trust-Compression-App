"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// On mobile, actions belong to the shell, not the scrolling page.
export function SageActionDock({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setTarget(media.matches ? document.getElementById("sage-action-dock") : null);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return target ? createPortal(children, target) : children;
}
