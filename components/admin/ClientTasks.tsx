"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  addTaskAction,
  toggleTaskAction,
  deleteTaskAction,
  type ClientActionState,
} from "@/lib/actions/clients";
import type { ClientTaskItem } from "@/lib/dal/clients";
import { cn, formatDateTime } from "@/lib/utils";
import { AdminButton, AdminInput } from "./ui";

const initialState: ClientActionState = { ok: false, error: null };

export function ClientTasks({
  clientId,
  tasks,
}: {
  clientId: string;
  tasks: ClientTaskItem[];
}) {
  const [state, formAction, pending] = useActionState(addTaskAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the input after a successful add so the next task starts fresh.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="flex flex-col gap-5">
      <form ref={formRef} action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <AdminInput
            name="title"
            required
            placeholder="Add a follow-up — e.g. Reply to scope email"
            aria-label="Task"
            className="flex-1"
          />
          <input
            type="datetime-local"
            name="dueAt"
            aria-label="Due date (optional)"
            className="rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25"
          />
          <AdminButton type="submit" loading={pending} className="shrink-0">
            Add
          </AdminButton>
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-red-500">
            {state.error}
          </p>
        )}
      </form>

      {tasks.length === 0 ? (
        <p className="text-sm text-[var(--admin-fg-muted)]">
          No tasks yet. Add the next thing to do for this client.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {open.length > 0 && (
            <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
              {open.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
                Completed ({done.length})
              </summary>
              <ul className="mt-2 flex flex-col divide-y divide-[var(--admin-border)]">
                {done.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: ClientTaskItem }) {
  const { overdue } = task;

  return (
    <li className="flex items-start gap-3 py-3">
      {/* Toggle is its own form so it posts independently of the add form. */}
      <form action={toggleTaskAction} className="pt-0.5">
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="done" value={task.done ? "false" : "true"} />
        <button
          type="submit"
          aria-label={task.done ? "Mark as not done" : "Mark as done"}
          className={cn(
            "grid size-5 place-items-center rounded-md border transition",
            task.done
              ? "border-[var(--admin-accent)] bg-[var(--admin-accent)] text-[var(--admin-accent-fg)]"
              : "border-[var(--admin-border-strong)] hover:border-[var(--admin-accent)]",
          )}
        >
          {task.done && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="size-3">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm",
            task.done && "text-[var(--admin-fg-subtle)] line-through",
          )}
        >
          {task.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--admin-fg-subtle)]">
          {task.dueAt && (
            <span className={cn(overdue && "font-medium text-red-500")}>
              {overdue ? "Overdue · " : "Due "}
              {formatDateTime(task.dueAt)}
            </span>
          )}
          {task.createdByName && <span>· {task.createdByName}</span>}
        </div>
      </div>

      <form action={deleteTaskAction}>
        <input type="hidden" name="taskId" value={task.id} />
        <button
          type="submit"
          aria-label="Delete task"
          className="rounded p-1 text-[var(--admin-fg-subtle)] transition hover:text-red-500"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </form>
    </li>
  );
}
