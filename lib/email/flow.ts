/* ---------------------------------------------------------------------------
   The shape of an "Email it" button's life, shared by every action behind one.

   Deliberately NOT in ./index.ts: that module is server-only, and these types
   are read by the client component that draws the button. Types alone, no
   runtime, so importing them costs a client bundle nothing.

   Two actions drive one of these. The preview action fills `preview` and sends
   nothing; the send action fills `delivery`. Both build their mail from the
   same composer on the server, so what a staff member approved in the preview
   is what actually leaves — the browser hands over an id and nothing else.
--------------------------------------------------------------------------- */

/** The mail as it will arrive, rendered but not sent. */
export type EmailPreview = {
  to: string;
  subject: string;
  /** The full HTML part, for an iframe. Never injected into the admin DOM. */
  html: string;
};

export type EmailDelivery = {
  sent: boolean;
  to: string;
  /** Only when `sent` is false — "never set up" is not "it failed". */
  reason?: "not_configured" | "failed";
};

export type EmailFlowState = {
  ok: boolean;
  error: string | null;
  preview?: EmailPreview;
  delivery?: EmailDelivery;
};

export const emailFlowInitial: EmailFlowState = { ok: false, error: null };
