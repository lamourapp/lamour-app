"use client";

import { ReactNode } from "react";
import Label from "./Label";

/**
 * Field = label + control wrapper.
 * Consolidates the label/input pairing that repeats across every form.
 */
export default function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  );
}
