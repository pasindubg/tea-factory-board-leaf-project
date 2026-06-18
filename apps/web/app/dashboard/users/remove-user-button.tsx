"use client";

import { SubmitButton } from "@/components/submit-button";
import { removeUser } from "./actions";

export function RemoveUserButton({ userId, userName }: { userId: string; userName: string }) {
  return (
    <form
      action={removeUser}
      onSubmit={(e) => {
        if (!confirm(`Remove ${userName}? They will no longer be able to sign in. Their historical records are kept.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <SubmitButton pendingText="Removing…" className="text-sm text-red-700 hover:underline">
        Remove
      </SubmitButton>
    </form>
  );
}
