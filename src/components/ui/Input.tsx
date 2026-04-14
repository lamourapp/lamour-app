"use client";

import { InputHTMLAttributes, forwardRef } from "react";
import { inputCls } from "./tokens";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", ...rest },
  ref,
) {
  return <input ref={ref} className={`${inputCls} ${className}`} {...rest} />;
});

export default Input;
