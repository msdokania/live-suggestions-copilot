"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

export function Panel({
  title,
  rightSlot,
  headerRight,
  children,
  className,
}: {
  title: string;
  rightSlot?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "flex flex-col min-h-0 h-full rounded-lg border border-panel-border bg-panel overflow-hidden",
        className,
      )}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-panel-border shrink-0">
        <h2 className="text-[11px] tracking-widest text-neutral-400 font-medium uppercase">
          {title}
        </h2>
        <div className="flex items-center gap-3 text-[11px] tracking-wider uppercase text-neutral-500">
          {headerRight}
          {rightSlot}
        </div>
      </header>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </section>
  );
}

export function IconButton({
  onClick,
  title,
  children,
  active,
  disabled,
  className,
}: {
  onClick?: () => void;
  title?: string;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center gap-2 rounded-md border border-panel-border bg-panel-soft px-3 py-1.5",
        "text-[12px] text-neutral-200 hover:border-neutral-500 hover:text-white",
        "transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        active && "border-neutral-400 text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function MicDot({ active }: { active: boolean }) {
  return (
    <span
      className={clsx(
        "inline-block h-2.5 w-2.5 rounded-full",
        active ? "bg-red-500 animate-pulse" : "bg-neutral-600",
      )}
    />
  );
}
