import * as React from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const baseInputClass =
  "w-full rounded-md border border-stone-300 px-3 py-2 text-sm bg-white text-stone-900 placeholder:text-stone-400 focus:border-green-600 focus:outline-none disabled:bg-stone-50 disabled:cursor-not-allowed";

export function Input({ label, error, hint, id, className = "", ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-stone-700">
          {label}
          {props.required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={[baseInputClass, error ? "border-red-400 focus:border-red-500" : "", className]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  );
}
