"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button with pending state disabling.
 */
export function SubmitButton({
  children,
  pendingText,
  className = "",
  ...rest
}: React.ComponentProps<"button"> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
      {...rest}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
