"use client";

import {
  ChevronDown,
  ChevronUp,
  Circle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { showAppToast } from "@/components/action-feedback";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { AppButton } from "@/components/ui/button";
import type { ListMutationResult } from "@/lib/list-mutations";
import {
  getDetailStateModel,
  type DetailStateStep,
} from "./detail-workspace-state";

export type DetailWorkspaceCreateAction = {
  label: string;
  title?: string;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
};

export type DetailWorkspaceSearchAction = {
  panelId: string;
  label?: string;
};

export type DetailWorkspaceStateCommand = {
  id: string;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  onSelect: () => void | Promise<void>;
};

export type DetailWorkspaceState = {
  currentKey: string | null;
  steps: DetailStateStep[];
  commands?: DetailWorkspaceStateCommand[];
  menuLabel?: string;
  testId?: string;
};

export type DetailWorkspaceDeleteAction = {
  label?: string;
  title: string;
  description: string;
  confirmLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  errorMessage?: string;
  action: () => Promise<ListMutationResult>;
  onSuccess?: (result: ListMutationResult) => void;
};

export function DetailWorkspace({
  rail,
  railAriaLabel = "Records",
  createAction,
  searchAction,
  state,
  deleteAction,
  headerActions,
  children,
  className = "",
  bodyClassName = "",
}: {
  rail: ReactNode;
  railAriaLabel?: string;
  createAction?: DetailWorkspaceCreateAction;
  searchAction?: DetailWorkspaceSearchAction;
  state?: DetailWorkspaceState;
  deleteAction?: DetailWorkspaceDeleteAction;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const railId = `detail-workspace-rail-${useId().replace(/:/g, "")}`;

  return (
    <div
      data-detail-workspace
      data-detail-workspace-rail-collapsed={railCollapsed || undefined}
      className={`grid min-h-[calc(100dvh-8rem)] w-full items-start gap-6 xl:grid-rows-[auto_minmax(0,1fr)] ${
        railCollapsed
          ? "xl:grid-cols-[minmax(0,1fr)]"
          : "xl:grid-cols-[clamp(13rem,18vw,20rem)_minmax(0,1fr)]"
      } ${className}`}
    >
      <header className={`flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-stone-700 dark:bg-stone-900 xl:row-start-1 ${railCollapsed ? "xl:col-start-1" : "xl:col-start-2"}`}>
        <div className="flex flex-wrap items-center gap-2">
          {railCollapsed ? (
            <AppButton
              type="button"
              variant="ghost"
              size="icon"
              aria-controls={railId}
              aria-expanded={false}
              aria-label="Show record list"
              title="Show record list"
              data-action-feedback-ignore
              onClick={() => setRailCollapsed(false)}
            >
              <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
            </AppButton>
          ) : null}

          {createAction ? (
            <AppButton
              type="button"
              variant="primary"
              size="icon"
              aria-label={createAction.label}
              title={createAction.title ?? createAction.label}
              data-action-feedback-ignore
              disabled={createAction.disabled}
              busy={createAction.busy}
              busyLabel={createAction.label}
              onClick={createAction.onClick}
              className="h-11 w-11"
            >
              <Plus aria-hidden="true" className="h-5 w-5" />
            </AppButton>
          ) : null}

          {searchAction ? (
            <AppButton
              type="button"
              variant="secondary"
              popoverTarget={searchAction.panelId}
              popoverTargetAction="toggle"
            >
              <Search aria-hidden="true" className="h-4 w-4" />
              {searchAction.label ?? "Search"}
            </AppButton>
          ) : null}

          {state?.commands?.length ? <DetailStateMenu state={state} /> : null}
          {deleteAction ? <DetailDeleteCommand config={deleteAction} /> : null}
          {headerActions}
        </div>

        {state ? <DetailStateIndicator state={state} /> : null}
      </header>

      <aside
        id={railId}
        aria-label={railAriaLabel}
        className={`min-w-0 xl:sticky xl:top-0 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:h-[calc(100dvh-8rem)] xl:min-h-[34rem] ${railCollapsed ? "hidden" : ""}`}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-stone-200 px-3 py-2 dark:border-stone-700">
            <span className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
              {railAriaLabel}
            </span>
            <AppButton
              type="button"
              variant="ghost"
              size="icon"
              aria-controls={railId}
              aria-expanded={true}
              aria-label="Collapse record list"
              title="Collapse record list"
              data-action-feedback-ignore
              onClick={() => setRailCollapsed(true)}
            >
              <PanelLeftClose aria-hidden="true" className="h-4 w-4" />
            </AppButton>
          </div>
          <div className="min-h-0 flex-1">{rail}</div>
        </div>
      </aside>

      <div
        data-detail-workspace-body
        className={`min-w-0 space-y-5 xl:row-start-2 ${railCollapsed ? "xl:col-start-1" : "xl:col-start-2"} ${bodyClassName}`}
      >
        {children}
      </div>
    </div>
  );
}

function DetailStateMenu({ state }: { state: DetailWorkspaceState }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const generatedId = useId().replace(/:/g, "");
  const menuId = `detail-state-menu-${generatedId}`;

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

  useEffect(() => {
    if (!open) return;

    const firstEnabled = itemRefs.current.find((item) => item && !item.disabled);
    firstEnabled?.focus();

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

  return (
    <div ref={menuRef} className="relative">
      <AppButton
        ref={triggerRef}
        type="button"
        variant="secondary"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        data-action-feedback-ignore
        onClick={() => setOpen((current) => !current)}
        className="min-w-28"
      >
        {state.menuLabel ?? "State"}
        <ChevronDown aria-hidden="true" className="h-4 w-4" />
      </AppButton>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={state.menuLabel ?? "State commands"}
          className="absolute left-0 top-[calc(100%+0.5rem)] z-[90] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-stone-200 bg-white p-2 shadow-2xl dark:border-stone-700 dark:bg-stone-950"
          onKeyDown={(event) => {
            const currentIndex = itemRefs.current.findIndex(
              (item) => item === document.activeElement,
            );
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
          {state.commands?.map((command, index) => (
            <AppButton
              key={command.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              data-action-feedback-ignore
              variant="ghost"
              disabled={command.disabled}
              busy={command.busy}
              busyLabel={command.busyLabel ?? "Working…"}
              onClick={() => {
                closeMenu();
                void command.onSelect();
              }}
              className="min-h-11 w-full justify-start rounded-xl border-transparent px-3 py-2 text-left shadow-none"
            >
              <span className="text-sm font-semibold">{command.label}</span>
            </AppButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DetailStateIndicator({ state }: { state: DetailWorkspaceState }) {
  const model = getDetailStateModel(state.steps, state.currentKey);
  if (!model.current) return null;

  return (
    <div className="group relative z-30 min-w-[13rem]">
      <AppButton
        type="button"
        variant="secondary"
        data-testid={state.testId ?? "detail-state-indicator"}
        data-action-feedback-ignore
        aria-label={`${model.current.label}, ${model.current.metric}`}
        className="min-h-11 w-full flex-col items-stretch justify-start rounded-xl px-3 py-2 text-left shadow-sm"
      >
        <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">
          {model.current.label} · {model.current.metric}
        </span>
        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
          <span
            className="block h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${model.progress}%` }}
          />
        </span>
      </AppButton>

      <div
        aria-label="Detail state sequence"
        className="invisible absolute right-0 top-[calc(100%+0.5rem)] w-[18rem] translate-y-1 rounded-xl border border-stone-200 bg-white p-2 opacity-0 shadow-2xl transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 dark:border-stone-700 dark:bg-stone-950"
      >
        {model.steps.map((step, index) => {
          const current = index === model.currentIndex;
          const completed = index < model.currentIndex;
          return (
            <div
              key={step.key}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                current
                  ? "bg-green-50 text-green-950 dark:bg-green-950 dark:text-green-100"
                  : "text-stone-700 dark:text-stone-200"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Circle
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 ${
                      current || completed
                        ? "fill-green-500 text-green-500"
                        : "fill-stone-300 text-stone-300 dark:fill-stone-700 dark:text-stone-700"
                    }`}
                  />
                  <span className="text-sm font-semibold">{step.label}</span>
                </div>
                <p className="ml-[1.125rem] mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                  {step.metric}
                </p>
              </div>
              {current ? (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                  Current
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailDeleteCommand({
  config,
}: {
  config: DetailWorkspaceDeleteAction;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    try {
      const result = await config.action();
      if (!result.ok) {
        showAppToast(result.error, "error");
        return;
      }
      setConfirming(false);
      showAppToast(result.notice ?? "Record deleted.");
      config.onSuccess?.(result);
    } catch {
      showAppToast(
        config.errorMessage ?? "Could not delete this record. Please try again.",
        "error",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <AppButton
        type="button"
        variant="danger"
        data-action-feedback-ignore
        disabled={config.disabled}
        busy={deleting}
        busyLabel="Deleting…"
        title={config.disabledReason}
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
        {config.label ?? "Delete"}
      </AppButton>
      <ConfirmationDialog
        open={confirming}
        title={config.title}
        description={config.description}
        confirmLabel={config.confirmLabel ?? config.label ?? "Delete"}
        destructive
        busy={deleting}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </>
  );
}

export function DetailRecordPanel({
  eyebrow,
  title,
  description,
  actions,
  children,
  footer,
  tone = "default",
  contentClassName = "mt-5",
  className = "",
  collapsible = true,
  defaultCollapsed = false,
  collapseLabel,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "draft";
  contentClassName?: string;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  collapseLabel?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const contentId = `detail-record-panel-${useId().replace(/:/g, "")}`;
  const contentVisible = !collapsible || !collapsed;
  const label = collapseLabel ?? (typeof title === "string" ? title : "detail group");

  return (
    <section
      data-detail-record-panel
      className={`rounded-xl border bg-white p-5 shadow-sm dark:bg-stone-900 ${
        tone === "draft"
          ? "border-green-200 dark:border-green-900"
          : "border-stone-200 dark:border-stone-700"
      } ${className}`}
    >
      <div className={`flex flex-wrap items-start justify-between gap-4 ${contentVisible ? "border-b border-stone-100 pb-4 dark:border-stone-800" : ""}`}>
        <div className="min-w-0">
          {eyebrow ? (
            <p
              className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                tone === "draft"
                  ? "text-green-700 dark:text-green-400"
                  : "text-stone-500 dark:text-stone-400"
              }`}
            >
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-1 text-xl font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              {description}
            </p>
          ) : null}
        </div>
        {actions || collapsible ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {actions}
            {collapsible ? (
              <AppButton
                type="button"
                variant="ghost"
                size="icon"
                aria-controls={contentId}
                aria-expanded={contentVisible}
                aria-label={`${contentVisible ? "Collapse" : "Expand"} ${label}`}
                title={`${contentVisible ? "Collapse" : "Expand"} ${label}`}
                data-action-feedback-ignore
                onClick={() => setCollapsed((current) => !current)}
              >
                {contentVisible ? (
                  <ChevronUp aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <ChevronDown aria-hidden="true" className="h-4 w-4" />
                )}
              </AppButton>
            ) : null}
          </div>
        ) : null}
      </div>

      {contentVisible ? (
        <div id={contentId} className={contentClassName}>{children}</div>
      ) : null}

      {contentVisible && footer ? (
        <div className="mt-5 border-t border-stone-100 pt-4 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function DetailField({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {label}
      </span>
      <span
        className="truncate text-sm font-medium leading-5 text-stone-800 dark:text-stone-200"
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function DetailEmptyPanel({
  title,
  description,
}: {
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-dashed border-stone-300 bg-stone-50/70 px-5 py-10 text-center dark:border-stone-700 dark:bg-stone-900/60">
      <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">
        {title}
      </h3>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        {description}
      </p>
    </section>
  );
}

export type { DetailStateStep };
