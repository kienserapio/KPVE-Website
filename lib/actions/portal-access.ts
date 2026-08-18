"use server";

import { revalidatePath } from "next/cache";

import { issuePortalAccessSchema, portalUserIdSchema } from "@/lib/validation";
import {
  issuePortalAccess,
  reissuePortalCode,
  removePortalUser,
  setPortalAccessDisabled,
  unlockPortalUser,
} from "@/lib/dal/portal-access";
import { requireSession } from "@/lib/dal/session";

/* ---------------------------------------------------------------------------
   Staff-side portal access. Every one of these is behind requireSession().

   The issued code rides home on the action's state and nowhere else — it is not
   revalidated onto the page, not written to the log, and not fetchable
   afterwards. Once the panel showing it is gone, the only option is to issue a
   new one.
--------------------------------------------------------------------------- */

export type PortalAccessState = {
  ok: boolean;
  error: string | null;
  /** Present on success — the one and only copy of the code. */
  issued?: {
    clientUserId: string;
    name: string;
    email: string;
    code: string;
    expiresAt: Date;
  };
};

const fail = (error: string): PortalAccessState => ({ ok: false, error });

function mapError(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong. Please try again.";

  switch (error.message) {
    case "UNAUTHORIZED":
      return "Your session expired. Please sign in again.";
    case "NOT_FOUND":
      return "That login no longer exists.";
    case "ALREADY_INVITED":
      return "That email already has access to this client — reissue their code instead.";
    case "ACCESS_DISABLED":
      return "That login is disabled. Turn it back on before issuing a new code.";
    case "HAS_SIGNED_IN":
      return "They have signed in before, so their history stays. Disable the login instead.";
    case "CODE_ALLOCATION_FAILED":
      return "Couldn't generate a code just then. Please try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export async function issuePortalAccessAction(
  _prev: PortalAccessState,
  formData: FormData,
): Promise<PortalAccessState> {
  const parsed = issuePortalAccessSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Couldn't give them access.");
  }

  try {
    await requireSession();
    const issued = await issuePortalAccess(parsed.data);

    revalidatePath(`/admin/clients/${issued.clientId}`);

    return {
      ok: true,
      error: null,
      issued: {
        clientUserId: issued.clientUserId,
        name: issued.name,
        email: issued.email,
        code: issued.code,
        expiresAt: issued.expiresAt,
      },
    };
  } catch (error) {
    console.error("[issuePortalAccessAction]", error);
    return fail(mapError(error));
  }
}

export async function reissuePortalCodeAction(
  _prev: PortalAccessState,
  formData: FormData,
): Promise<PortalAccessState> {
  const parsed = portalUserIdSchema.safeParse({
    clientUserId: formData.get("clientUserId"),
  });

  if (!parsed.success) return fail("That login couldn't be found.");

  try {
    await requireSession();
    const issued = await reissuePortalCode(parsed.data.clientUserId);

    revalidatePath(`/admin/clients/${issued.clientId}`);

    return {
      ok: true,
      error: null,
      issued: {
        clientUserId: issued.clientUserId,
        name: issued.name,
        email: issued.email,
        code: issued.code,
        expiresAt: issued.expiresAt,
      },
    };
  } catch (error) {
    console.error("[reissuePortalCodeAction]", error);
    return fail(mapError(error));
  }
}

/**
 * One action, two buttons — the intent rides in a hidden field.
 *
 * Stateful, unlike its siblings below, because this is the one whose silent
 * failure would be believed: a staff member presses Disable on an expired
 * session, nothing happens, and they walk away certain that access is gone.
 */
export async function setPortalAccessAction(
  _prev: PortalAccessState,
  formData: FormData,
): Promise<PortalAccessState> {
  const parsed = portalUserIdSchema.safeParse({
    clientUserId: formData.get("clientUserId"),
  });
  if (!parsed.success) return fail("That login couldn't be found.");

  const disabled = formData.get("disabled") === "true";

  try {
    await requireSession();
    const { clientId } = await setPortalAccessDisabled(
      parsed.data.clientUserId,
      disabled,
    );
    revalidatePath(`/admin/clients/${clientId}`);
    return { ok: true, error: null };
  } catch (error) {
    console.error("[setPortalAccessAction]", error);
    return fail(mapError(error));
  }
}

export async function unlockPortalAccessAction(formData: FormData): Promise<void> {
  const clientUserId = String(formData.get("clientUserId") ?? "");
  if (!clientUserId) return;

  try {
    await requireSession();
    const { clientId } = await unlockPortalUser(clientUserId);
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[unlockPortalAccessAction]", error);
  }
}

export async function removePortalAccessAction(formData: FormData): Promise<void> {
  const clientUserId = String(formData.get("clientUserId") ?? "");
  if (!clientUserId) return;

  try {
    await requireSession();
    const { clientId } = await removePortalUser(clientUserId);
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    // Refused for a login that has signed in before, which the UI does not
    // offer — a race, not a path anyone can drive.
    console.error("[removePortalAccessAction]", error);
  }
}
