"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/dal/session";
import {
  createClient,
  updateClient,
  deleteClient,
  addTask,
  toggleTask,
  deleteTask,
} from "@/lib/dal/clients";
import {
  createClientSchema,
  updateClientSchema,
  createTaskSchema,
} from "@/lib/validation";

export type ClientActionState = { ok: boolean; error: string | null };

const initialFail = (error: string): ClientActionState => ({ ok: false, error });

function mapError(error: unknown): string {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return "Your session expired. Please sign in again.";
  }
  if (error instanceof Error && error.message === "NOT_FOUND") {
    return "That record no longer exists.";
  }
  return "Something went wrong. Please try again.";
}

/* ---------------------------------------------------------------------------
   Client create / update / delete
--------------------------------------------------------------------------- */

export async function createClientAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const parsed = createClientSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company") ?? undefined,
    email: formData.get("email"),
    phone: formData.get("phone") ?? undefined,
    assignedStaffId: formData.get("assignedStaffId") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return initialFail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }

  let clientId: string;
  try {
    await requireSession();
    ({ id: clientId } = await createClient(parsed.data));
  } catch (error) {
    console.error("[createClientAction]", error);
    return initialFail(mapError(error));
  }

  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${clientId}`);
}

export async function updateClientAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const parsed = updateClientSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name") || undefined,
    company: formData.get("company") ?? undefined,
    email: formData.get("email") || undefined,
    phone: formData.get("phone") ?? undefined,
    category: formData.get("category") || undefined,
    status: formData.get("status") || undefined,
    assignedStaffId: formData.get("assignedStaffId") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return initialFail(parsed.error.issues[0]?.message ?? "Those changes couldn't be saved.");
  }

  const { clientId, ...patch } = parsed.data;

  try {
    await requireSession();
    await updateClient(clientId, patch);
  } catch (error) {
    console.error("[updateClientAction]", error);
    return initialFail(mapError(error));
  }

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true, error: null };
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return;

  try {
    await requireSession();
    await deleteClient(clientId);
  } catch (error) {
    console.error("[deleteClientAction]", error);
    redirect(`/admin/clients/${clientId}`);
  }

  revalidatePath("/admin/clients");
  redirect("/admin/clients");
}

/* ---------------------------------------------------------------------------
   Tasks
--------------------------------------------------------------------------- */

export async function addTaskAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const parsed = createTaskSchema.safeParse({
    clientId: formData.get("clientId"),
    title: formData.get("title"),
    dueAt: formData.get("dueAt") ?? undefined,
  });

  if (!parsed.success) {
    return initialFail(parsed.error.issues[0]?.message ?? "Couldn't add that task.");
  }

  try {
    await requireSession();
    await addTask({
      clientId: parsed.data.clientId,
      title: parsed.data.title,
      // datetime-local is local wall-clock with no zone; new Date() reads it as
      // local time, which is what the user meant when they picked it.
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    });
  } catch (error) {
    console.error("[addTaskAction]", error);
    return initialFail(mapError(error));
  }

  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
  return { ok: true, error: null };
}

export async function toggleTaskAction(formData: FormData): Promise<void> {
  const taskId = String(formData.get("taskId") ?? "");
  const done = formData.get("done") === "true";
  if (!taskId) return;

  try {
    await requireSession();
    const { clientId } = await toggleTask(taskId, done);
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[toggleTaskAction]", error);
  }
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return;

  try {
    await requireSession();
    const { clientId } = await deleteTask(taskId);
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[deleteTaskAction]", error);
  }
}
