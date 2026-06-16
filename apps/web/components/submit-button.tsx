"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that disables itself while its parent <form> is submitting and
 * (optionally) swaps its label for a pending message. Uses useFormStatus, so it
 * must be rendered inside the <form> it belongs to — which works even when the
 * form lives in a server component with a server-action `action`.
 *
 * Prevents the double-submit problem on slow networks: one press, immediate
 * visual confirmation, no second fire.
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
