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
import { addClientNote, deleteClientNote } from "@/lib/dal/notes";
import { addClientDocument, deleteClientDocument } from "@/lib/dal/documents";
import {
  createClientSchema,
  updateClientSchema,
  createTaskSchema,
  createNoteSchema,
  createDocumentSchema,
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
  if (error instanceof Error && error.message === "INVALID_PARENT") {
    return "A business can only be owned by an individual client, and only one level deep.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * The client schemas turn a cleared field into `undefined`, and the DAL reads
 * `undefined` as "leave this column alone" — so on its own, emptying a field in
 * the editor would silently keep the old value. The form posts every field it
 * renders, so "posted, and blank" is an instruction to clear it: null.
 */
function clearedToNull(formData: FormData, key: string): null | undefined {
  const raw = formData.get(key);
  return typeof raw === "string" && raw.trim() === "" ? null : undefined;
}

/* ---------------------------------------------------------------------------
   Client create / update / delete
--------------------------------------------------------------------------- */

export async function createClientAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const parsed = createClientSchema.safeParse({
    clientType: formData.get("clientType") || undefined,
    name: formData.get("name"),
    contactName: formData.get("contactName") ?? undefined,
    company: formData.get("company") ?? undefined,
    email: formData.get("email"),
    phone: formData.get("phone") ?? undefined,
    parentClientId: formData.get("parentClientId") ?? undefined,
    assignedStaffId: formData.get("assignedStaffId") ?? undefined,
    notes: formData.get("notes") ?? undefined,
    billingName: formData.get("billingName") ?? undefined,
    billingAbn: formData.get("billingAbn") ?? undefined,
    billingEmail: formData.get("billingEmail") ?? undefined,
    billingAddress: formData.get("billingAddress") ?? undefined,
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
    clientType: formData.get("clientType") || undefined,
    name: formData.get("name") || undefined,
    contactName: formData.get("contactName") ?? undefined,
    company: formData.get("company") ?? undefined,
    email: formData.get("email") || undefined,
    phone: formData.get("phone") ?? undefined,
    parentClientId: formData.get("parentClientId") ?? undefined,
    category: formData.get("category") || undefined,
    status: formData.get("status") || undefined,
    assignedStaffId: formData.get("assignedStaffId") ?? undefined,
    notes: formData.get("notes") ?? undefined,
    billingName: formData.get("billingName") ?? undefined,
    billingAbn: formData.get("billingAbn") ?? undefined,
    billingEmail: formData.get("billingEmail") ?? undefined,
    billingAddress: formData.get("billingAddress") ?? undefined,
  });

  if (!parsed.success) {
    return initialFail(parsed.error.issues[0]?.message ?? "Those changes couldn't be saved.");
  }

  const { clientId, ...fields } = parsed.data;

  // Fields that can be emptied on purpose: a contact person who left, an ABN
  // typed into the wrong client. Everything else keeps today's behaviour.
  const patch = {
    ...fields,
    contactName: fields.contactName ?? clearedToNull(formData, "contactName"),
    billingName: fields.billingName ?? clearedToNull(formData, "billingName"),
    billingAbn: fields.billingAbn ?? clearedToNull(formData, "billingAbn"),
    billingEmail: fields.billingEmail ?? clearedToNull(formData, "billingEmail"),
    billingAddress: fields.billingAddress ?? clearedToNull(formData, "billingAddress"),
  };

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

/* ---------------------------------------------------------------------------
   Notes timeline
--------------------------------------------------------------------------- */

export async function addNoteAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const parsed = createNoteSchema.safeParse({
    clientId: formData.get("clientId"),
    kind: formData.get("kind") || undefined,
    body: formData.get("body"),
    occurredAt: formData.get("occurredAt") ?? undefined,
  });

  if (!parsed.success) {
    return initialFail(parsed.error.issues[0]?.message ?? "Couldn't save that entry.");
  }

  try {
    await requireSession();
    await addClientNote({
      clientId: parsed.data.clientId,
      kind: parsed.data.kind,
      body: parsed.data.body,
      occurredAt: parsed.data.occurredAt ?? null,
    });
  } catch (error) {
    console.error("[addNoteAction]", error);
    return initialFail(mapError(error));
  }

  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
  revalidatePath("/admin/clients");
  return { ok: true, error: null };
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const noteId = String(formData.get("noteId") ?? "");
  if (!noteId) return;

  try {
    await requireSession();
    const { clientId } = await deleteClientNote(noteId);
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[deleteNoteAction]", error);
  }
}

/* ---------------------------------------------------------------------------
   Documents
--------------------------------------------------------------------------- */

export async function addDocumentAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const parsed = createDocumentSchema.safeParse({
    clientId: formData.get("clientId"),
    label: formData.get("label"),
    url: formData.get("url"),
    kind: formData.get("kind") || undefined,
  });

  if (!parsed.success) {
    return initialFail(parsed.error.issues[0]?.message ?? "Couldn't save that document.");
  }

  try {
    await requireSession();
    await addClientDocument(parsed.data);
  } catch (error) {
    console.error("[addDocumentAction]", error);
    return initialFail(mapError(error));
  }

  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
  return { ok: true, error: null };
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;

  try {
    await requireSession();
    const { clientId } = await deleteClientDocument(documentId);
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[deleteDocumentAction]", error);
  }
}
