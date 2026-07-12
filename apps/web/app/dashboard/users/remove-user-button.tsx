"use client";

import { useRef, useState } from "react";
import { removeUser } from "./actions";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

export function RemoveUserButton({ userId, userName }: { userId: string; userName: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <>
      <form ref={formRef} action={removeUser}>
        <input type="hidden" name="user_id" value={userId} />
        <button type="button" onClick={() => setConfirming(true)} className="text-sm text-red-700 hover:underline dark:text-red-400">Remove</button>
      </form>
      <ConfirmationDialog
        open={confirming}
        title={`Remove ${userName}?`}
        description="They will no longer be able to sign in. Their historical records will be kept."
        confirmLabel="Remove user"
        destructive
        busy={removing}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setRemoving(true);
          formRef.current?.requestSubmit();
        }}
      />
    </>
  );
}
