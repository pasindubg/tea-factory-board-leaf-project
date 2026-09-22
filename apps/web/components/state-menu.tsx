"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { AppButton } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

export type StateMenuCommand = {
  id: string;
  label: string;
  title?: string;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  confirm?: { title: string; description: string; confirmLabel?: string };
  onSelect: () => void | Promise<unknown>;
};

export function StateMenu({ label = "State", commands, disabled, onSettled }: {
  label?: string;
  commands: StateMenuCommand[];
  disabled?: boolean;
  onSettled?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<StateMenuCommand | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = `state-menu-${useId().replace(/:/g, "")}`;
  const busyCommand = commands.find((command) => command.busy || command.id === pendingId);
  const available = commands.filter((command) => !command.disabled || command === busyCommand);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  function focusCommand(direction: 1 | -1, from: number) {
    const enabled = itemRefs.current
      .map((element, index) => ({ element, index }))
      .filter((item) => item.element && !item.element.disabled);
    if (enabled.length === 0) return;
    const currentPosition = enabled.findIndex((item) => item.index === from);
    const nextPosition =
      currentPosition < 0
        ? direction === 1
          ? 0
          : enabled.length - 1
        : (currentPosition + direction + enabled.length) % enabled.length;
    enabled[nextPosition]?.element?.focus();
  }

  function select(command: StateMenuCommand) {
    if (command.confirm && !confirming) {
      closeMenu();
      setConfirming(command);
      return;
    }
    const result = command.onSelect();
    if (!(result instanceof Promise)) {
      closeMenu();
      setConfirming(null);
      return;
    }
    setPendingId(command.id);
    startTransition(async () => {
      await result.catch(() => undefined);
    });
  }

  useEffect(() => {
    if (isPending || !pendingId) return;
    setPendingId(null);
    setConfirming(null);
    closeMenu();
    onSettled?.();
  }, [closeMenu, isPending, pendingId, onSettled]);

  useEffect(() => {
    if (!open) return;

    itemRefs.current.find((item) => item && !item.disabled)?.focus();

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu(true);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeMenu, open]);

  const dialog = confirming?.confirm ? (
    <ConfirmationDialog
      open
      title={confirming.confirm.title}
      description={confirming.confirm.description}
      confirmLabel={confirming.confirm.confirmLabel ?? confirming.label}
      busy={Boolean(pendingId)}
      onCancel={() => setConfirming(null)}
      onConfirm={() => select(confirming)}
    />
  ) : null;

  if (available.length === 0 && !busyCommand) return dialog;

  if (available.length === 1) {
    const command = available[0];
    return (
      <>
        <AppButton
          type="button"
          variant="secondary"
          title={command.title}
          busy={command === busyCommand}
          busyLabel={command.busyLabel ?? "Working…"}
          disabled={disabled && !busyCommand}
          onClick={() => select(command)}
          className="min-w-28"
        >
          {command.label}
        </AppButton>
        {dialog}
      </>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <AppButton
        ref={triggerRef}
        type="button"
        variant="secondary"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-busy={busyCommand ? true : undefined}
        disabled={disabled && !busyCommand}
        onClick={() => setOpen((current) => !current)}
        className="min-w-28"
      >
        {busyCommand ? (
          <>
            <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {busyCommand.busyLabel ?? "Working…"}
          </>
        ) : (
          <>
            {label}
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          </>
        )}
      </AppButton>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute left-0 top-[calc(100%+0.5rem)] z-[90] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-stone-200 bg-white p-2 shadow-2xl dark:border-stone-700 dark:bg-stone-950"
          onKeyDown={(event) => {
            const currentIndex = itemRefs.current.findIndex((item) => item === document.activeElement);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusCommand(1, currentIndex);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              focusCommand(-1, currentIndex);
            } else if (event.key === "Home") {
              event.preventDefault();
              focusCommand(1, -1);
            } else if (event.key === "End") {
              event.preventDefault();
              focusCommand(-1, -1);
            }
          }}
        >
          {available.map((command, index) => (
            <AppButton
              key={command.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              variant="ghost"
              title={command.title}
              disabled={Boolean(busyCommand)}
              busy={busyCommand?.id === command.id}
              busyLabel={command.busyLabel ?? "Working…"}
              onClick={() => select(command)}
              className="min-h-11 w-full justify-start rounded-xl border-transparent px-3 py-2 text-left shadow-none"
            >
              <span className="text-sm font-semibold">{command.label}</span>
            </AppButton>
          ))}
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
