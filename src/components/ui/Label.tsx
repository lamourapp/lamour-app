"use client";

import { ReactNode } from "react";
import { labelCls } from "./tokens";

export default function Label({
  children,
  className = "",
  hint,
}: {
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
}) {
  return (
    <span className={`${labelCls} ${className}`}>
      {children}
      {hint && <span className="ml-1 normal-case font-normal text-gray-400">{hint}</span>}
    </span>
  );
}
