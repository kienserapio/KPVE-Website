import { PageLoader } from "@/components/PageLoader";

/** The checkout page — the one place a blank pause is most alarming. */
export default function CheckoutLoading() {
  return <PageLoader variant="brand" label="Loading payment" />;
}
