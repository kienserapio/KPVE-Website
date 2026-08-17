"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/dal/session";
import {
  addClientService,
  addServiceItem,
  createService,
  deleteService,
  markClientServiceBilled,
  removeClientService,
  removeServiceItem,
  updateClientService,
  updateService,
} from "@/lib/dal/services";
import { addTaskTemplate, deleteTaskTemplate } from "@/lib/dal/checklists";
import {
  createClientServiceSchema,
  createServiceItemSchema,
  createServiceSchema,
  createTaskTemplateSchema,
  updateClientServiceSchema,
  updateServiceSchema,
} from "@/lib/validation";

export type ServiceActionState = { ok: boolean; error: string | null };

const fail = (error: string): ServiceActionState => ({ ok: false, error });

function mapError(error: unknown): string {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return "Your session expired. Please sign in again.";
  }
  if (error instanceof Error && error.message === "NOT_FOUND") {
    return "That record no longer exists.";
  }
  if (error instanceof Error && error.message === "NOT_RECURRING") {
    return "A one-off doesn't have a billing cycle to advance.";
  }
  return "Something went wrong. Please try again.";
}

/* ---------------------------------------------------------------------------
   Catalogue
--------------------------------------------------------------------------- */

export async function createServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = createServiceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    defaultAmount: formData.get("defaultAmount"),
    defaultCurrency: formData.get("defaultCurrency") || undefined,
    defaultInterval: formData.get("defaultInterval") || undefined,
    unitLabel: formData.get("unitLabel") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }

  try {
    await requireSession();
    await createService({
      name: parsed.data.name,
      description: parsed.data.description,
      defaultAmountCents: parsed.data.defaultAmount,
      defaultCurrency: parsed.data.defaultCurrency,
      defaultInterval: parsed.data.defaultInterval,
      unitLabel: parsed.data.unitLabel,
    });
  } catch (error) {
    console.error("[createServiceAction]", error);
    return fail(mapError(error));
  }

  revalidatePath("/admin/services");
  return { ok: true, error: null };
}

export async function updateServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = updateServiceSchema.safeParse({
    serviceId: formData.get("serviceId"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    defaultAmount: formData.get("defaultAmount"),
    defaultCurrency: formData.get("defaultCurrency") || undefined,
    defaultInterval: formData.get("defaultInterval") || undefined,
    unitLabel: formData.get("unitLabel") ?? undefined,
    isActive: formData.get("isActive") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Those changes couldn't be saved.");
  }

  const { serviceId, defaultAmount, ...rest } = parsed.data;

  try {
    await requireSession();
    await updateService(serviceId, {
      name: rest.name,
      description: rest.description,
      defaultAmountCents: defaultAmount,
      defaultCurrency: rest.defaultCurrency,
      defaultInterval: rest.defaultInterval,
      // `|| null` so blanking the field clears it — "this isn't counted" has to
      // be sayable, and an empty string here would leave the old label behind
      // (or store a "" that means the same thing as NULL but doesn't look it).
      unitLabel: rest.unitLabel || null,
      isActive: rest.isActive,
    });
  } catch (error) {
    console.error("[updateServiceAction]", error);
    return fail(mapError(error));
  }

  revalidatePath("/admin/services");
  return { ok: true, error: null };
}

/** Archive / unarchive without opening the editor. */
export async function toggleServiceActiveAction(formData: FormData): Promise<void> {
  const serviceId = String(formData.get("serviceId") ?? "");
  const isActive = formData.get("isActive") === "true";
  if (!serviceId) return;

  try {
    await requireSession();
    await updateService(serviceId, { isActive });
    revalidatePath("/admin/services");
  } catch (error) {
    console.error("[toggleServiceActiveAction]", error);
  }
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  const serviceId = String(formData.get("serviceId") ?? "");
  if (!serviceId) return;

  try {
    await requireSession();
    await deleteService(serviceId);
    revalidatePath("/admin/services");
  } catch (error) {
    console.error("[deleteServiceAction]", error);
  }
}

/* ---------------------------------------------------------------------------
   Onboarding checklists — a service's steps, copied onto a client on attach
--------------------------------------------------------------------------- */

export async function addTaskTemplateAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = createTaskTemplateSchema.safeParse({
    serviceId: formData.get("serviceId"),
    title: formData.get("title"),
    offsetDays: formData.get("offsetDays") || 0,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Couldn't add that step.");
  }

  try {
    await requireSession();
    await addTaskTemplate(parsed.data);
  } catch (error) {
    console.error("[addTaskTemplateAction]", error);
    return fail(mapError(error));
  }

  revalidatePath("/admin/services");
  return { ok: true, error: null };
}

export async function deleteTaskTemplateAction(formData: FormData): Promise<void> {
  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) return;

  try {
    await requireSession();
    await deleteTaskTemplate(templateId);
    revalidatePath("/admin/services");
  } catch (error) {
    console.error("[deleteTaskTemplateAction]", error);
  }
}

/* ---------------------------------------------------------------------------
   Client services
--------------------------------------------------------------------------- */

export async function addClientServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = createClientServiceSchema.safeParse({
    clientId: formData.get("clientId"),
    serviceId: formData.get("serviceId") ?? undefined,
    label: formData.get("label"),
    unitAmount: formData.get("unitAmount"),
    quantity: formData.get("quantity") || undefined,
    termCount: formData.get("termCount") || undefined,
    currency: formData.get("currency") || undefined,
    interval: formData.get("interval") || undefined,
    status: formData.get("status") || undefined,
    startedAt: formData.get("startedAt") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }

  try {
    await requireSession();
    await addClientService({
      clientId: parsed.data.clientId,
      serviceId: parsed.data.serviceId,
      label: parsed.data.label,
      // Unit, quantity and term — never a total. The DAL multiplies them.
      unitAmountCents: parsed.data.unitAmount,
      quantity: parsed.data.quantity,
      termCount: parsed.data.termCount,
      currency: parsed.data.currency,
      interval: parsed.data.interval,
      status: parsed.data.status,
      startedAt: parsed.data.startedAt,
      notes: parsed.data.notes,
    });
  } catch (error) {
    console.error("[addClientServiceAction]", error);
    return fail(mapError(error));
  }

  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  return { ok: true, error: null };
}

export async function updateClientServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = updateClientServiceSchema.safeParse({
    clientServiceId: formData.get("clientServiceId"),
    label: formData.get("label") || undefined,
    unitAmount: formData.get("unitAmount") || undefined,
    quantity: formData.get("quantity") ?? undefined,
    termCount: formData.get("termCount") ?? undefined,
    currency: formData.get("currency") || undefined,
    interval: formData.get("interval") || undefined,
    status: formData.get("status") || undefined,
    startedAt: formData.get("startedAt") ?? undefined,
    nextBillAt: formData.get("nextBillAt") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Those changes couldn't be saved.");
  }

  const { clientServiceId, unitAmount, quantity, termCount, ...rest } = parsed.data;

  try {
    await requireSession();
    // Either half may be absent — the "set quantity to 4" prompt posts nothing
    // but a quantity. The DAL reads the other half back and recomputes.
    const { clientId } = await updateClientService(clientServiceId, {
      label: rest.label,
      unitAmountCents: unitAmount,
      quantity,
      termCount,
      currency: rest.currency,
      interval: rest.interval,
      status: rest.status,
      startedAt: rest.startedAt,
      nextBillAt: rest.nextBillAt,
      notes: rest.notes,
    });
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[updateClientServiceAction]", error);
    return fail(mapError(error));
  }

  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  return { ok: true, error: null };
}

/** One-click status change from the services table — pause, resume, cancel. */
export async function setClientServiceStatusAction(formData: FormData): Promise<void> {
  const clientServiceId = String(formData.get("clientServiceId") ?? "");
  const parsed = updateClientServiceSchema.safeParse({
    clientServiceId,
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return;

  try {
    await requireSession();
    const { clientId } = await updateClientService(clientServiceId, {
      status: parsed.data.status,
    });
    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath("/admin/clients");
    revalidatePath("/admin");
  } catch (error) {
    console.error("[setClientServiceStatusAction]", error);
  }
}

export async function markBilledAction(formData: FormData): Promise<void> {
  const clientServiceId = String(formData.get("clientServiceId") ?? "");
  if (!clientServiceId) return;

  try {
    await requireSession();
    const { clientId } = await markClientServiceBilled(clientServiceId);
    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath("/admin");
  } catch (error) {
    console.error("[markBilledAction]", error);
  }
}

export async function removeClientServiceAction(formData: FormData): Promise<void> {
  const clientServiceId = String(formData.get("clientServiceId") ?? "");
  if (!clientServiceId) return;

  try {
    await requireSession();
    const { clientId } = await removeClientService(clientServiceId);
    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath("/admin/clients");
    revalidatePath("/admin");
  } catch (error) {
    console.error("[removeClientServiceAction]", error);
  }
}

/* ---------------------------------------------------------------------------
   Provisioned items

   Only the client page is revalidated: items describe what a line covers, not
   what it's worth, so no MRR anywhere else moves when one is added or removed.
--------------------------------------------------------------------------- */

export async function addServiceItemAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = createServiceItemSchema.safeParse({
    clientServiceId: formData.get("clientServiceId"),
    label: formData.get("label"),
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Couldn't add that.");
  }

  try {
    await requireSession();
    const { clientId } = await addServiceItem(parsed.data);
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[addServiceItemAction]", error);
    return fail(mapError(error));
  }

  return { ok: true, error: null };
}

export async function removeServiceItemAction(formData: FormData): Promise<void> {
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return;

  try {
    await requireSession();
    const { clientId } = await removeServiceItem(itemId);
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[removeServiceItemAction]", error);
  }
}
