import { PageLoader } from "@/components/PageLoader";

/**
 * Shown inside the admin shell while a dashboard page streams. Sits at the
 * route-group root so the sidebar, header and theme stay put and only the
 * canvas swaps — navigating should feel like the page changing, not the app
 * restarting.
 */
export default function AdminLoading() {
  return <PageLoader label="Loading" />;
}
