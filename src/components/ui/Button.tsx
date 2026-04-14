"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { btnBase, btnSizes, btnVariants } from "./tokens";

type Variant = keyof typeof btnVariants;
type Size = keyof typeof btnSizes;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", fullWidth, className = "", ...rest },
  ref,
) {
  const cls = [
    btnBase,
    btnSizes[size],
    btnVariants[variant],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button ref={ref} className={cls} {...rest} />;
});

export default Button;
