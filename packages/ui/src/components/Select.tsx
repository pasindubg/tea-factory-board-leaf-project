import * as React from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
}

const baseSelectClass =
  "w-full rounded-md border border-stone-300 px-3 py-2 text-sm bg-white text-stone-900 focus:border-green-600 focus:outline-none disabled:bg-stone-50 disabled:cursor-not-allowed";

export function Select({
  label,
  options,
  placeholder,
  error,
  id,
  className = "",
  ...props
}: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-stone-700">
          {label}
          {props.required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={[baseSelectClass, error ? "border-red-400" : "", className]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
