import { PageLoader } from "@/components/PageLoader";

/**
 * Every portal page reads the session cookie, so every one of them is dynamic
 * and costs a round trip — exactly the case a fallback is for. Bare, because
 * the group layout already supplies `data-theme` and the admin palette
 * resolves inside it.
 */
export default function PortalLoading() {
  return <PageLoader label="Loading" />;
}
