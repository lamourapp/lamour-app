"use client";

import { SelectHTMLAttributes, forwardRef } from "react";
import { selectCls } from "./tokens";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = "", children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={`${selectCls} ${className}`} {...rest}>
      {children}
    </select>
  );
});

export default Select;
