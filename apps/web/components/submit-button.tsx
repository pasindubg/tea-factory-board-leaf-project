"use client";

import { useFormStatus } from "react-dom";
import { AppButton } from "@/components/ui/button";

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
    <AppButton
      type="submit"
      busy={pending}
      busyLabel={pendingText}
      className={className}
      {...rest}
    >
      {children}
    </AppButton>
  );
}
