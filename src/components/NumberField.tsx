"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

// Native <input type="number"> is the source of the classic "type 10, see
// 010" bug: a controlled numeric value re-renders mid-keystroke and the
// browser doesn't always resync the leading zero away. We render a plain
// text field instead and own the parsing. min/max are enforced on blur only
// — clamping mid-keystroke breaks typing any multi-digit number that passes
// through an out-of-range intermediate value (see git history for the bug
// this caused: typing "18" into a min=17 field snapped to 17 after the
// first digit, then subsequent digits landed on the wrong value).
export function NumberField({
  value,
  onChange,
  min,
  max,
  className,
  ...props
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type" | "min" | "max">) {
  const [text, setText] = React.useState(String(value));
  const [prevValue, setPrevValue] = React.useState(value);

  // Resync the display text when `value` changes from outside (e.g. the
  // language test switch resetting scores) without an effect + extra
  // render: https://react.dev/learn/you-might-not-need-an-effect
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      className={className}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== "" && !/^-?\d*\.?\d*$/.test(raw)) return;

        const cleaned = raw.replace(/^(-?)0+(?=\d)/, "$1");
        setText(cleaned);

        if (cleaned === "" || cleaned === "-" || cleaned === ".") return;
        const num = Number(cleaned);
        if (Number.isNaN(num)) return;

        // Report the value as typed, unclamped — clamping mid-keystroke
        // corrupts multi-digit entry whenever a digit passes through a value
        // below `min` (e.g. typing "18" one digit at a time when min=17: the
        // "1" alone would get snapped straight to 17).
        onChange(num);
      }}
      onBlur={() => {
        const num = Number(text);
        if (text !== "" && !Number.isNaN(num)) {
          const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, num));
          if (clamped !== num) onChange(clamped);
          setText(String(clamped));
        } else {
          setText(String(value));
        }
      }}
    />
  );
}
