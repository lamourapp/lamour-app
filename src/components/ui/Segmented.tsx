"use client";

import { ReactNode } from "react";
import { segmentedWrap, segmentedItem, segmentedItemActive, segmentedItemIdle } from "./tokens";

export interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
}

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`${segmentedWrap} ${className}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`active:scale-[0.97] transition-transform ${segmentedItem} ${value === o.id ? segmentedItemActive : segmentedItemIdle}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
