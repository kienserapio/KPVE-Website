"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/dal/session";
import {
  addClientService,
  createService,
  deleteService,
  markClientServiceBilled,
  removeClientService,
  updateClientService,
  updateService,
} from "@/lib/dal/services";
import {
  createClientServiceSchema,
  createServiceSchema,
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
    amount: formData.get("amount"),
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
      amountCents: parsed.data.amount,
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
    amount: formData.get("amount") || undefined,
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

  const { clientServiceId, amount, ...rest } = parsed.data;

  try {
    await requireSession();
    const { clientId } = await updateClientService(clientServiceId, {
      label: rest.label,
      amountCents: amount,
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
