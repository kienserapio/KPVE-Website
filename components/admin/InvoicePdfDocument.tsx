import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { InvoiceDetail } from "@/lib/dal/invoices";
import { formatMoney, formatTaxRate } from "@/lib/billing";
import { formatDate } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The invoice as a real, generated PDF file.

   Why this exists alongside InvoiceDocument (the HTML sheet): the HTML is the
   on-screen preview and the print-to-PDF path; this is the one-click, formal
   `.pdf` a client's accountant files. react-pdf has its own layout primitives
   (no DOM, no CSS), so this is a deliberate second rendering of the SAME data —
   the price of a downloadable file that renders identically on every machine
   rather than however each browser's print dialog feels like drawing it.

   It reads the exact InvoiceDetail the HTML does and formats money and dates
   through the same lib/billing + lib/utils helpers, so the two can't quote
   different numbers. The staff-only ATO completeness warnings are intentionally
   absent here, same as on the client's HTML copy — they're a screen tool, never
   part of the document itself.

   Runs only in the Node runtime (renderToBuffer), from the two /pdf routes.
--------------------------------------------------------------------------- */

const COLOR = {
  ink: "#141821",
  body: "#3F4753",
  muted: "#6B7280",
  subtle: "#9AA1AC",
  accent: "#B4881F", // KPVE gold
  border: "#E4E7EC",
  hair: "#EEF0F3",
  panel: "#F8F9FB",
} as const;

const styles = StyleSheet.create({
  page: {
    paddingVertical: 44,
    paddingHorizontal: 46,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: COLOR.body,
    lineHeight: 1.45,
  },

  /* Header */
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  sellerName: { fontFamily: "Helvetica-Bold", fontSize: 15, color: COLOR.ink },
  sellerLine: { fontSize: 9, color: COLOR.muted, marginTop: 1.5 },
  titleBlock: { alignItems: "flex-end", maxWidth: 230 },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 17,
    letterSpacing: 1.5,
    color: COLOR.accent,
    textTransform: "uppercase",
  },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3 },
  metaLabel: { fontSize: 9, color: COLOR.subtle, marginRight: 8 },
  metaValue: { fontSize: 9, color: COLOR.ink, fontFamily: "Helvetica-Bold" },

  rule: { borderBottomWidth: 1, borderBottomColor: COLOR.border, marginTop: 20 },

  /* Bill-to */
  section: { marginTop: 20 },
  heading: {
    fontSize: 8,
    letterSpacing: 1,
    color: COLOR.subtle,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  partyName: { fontFamily: "Helvetica-Bold", fontSize: 10.5, color: COLOR.ink },
  partyLine: { fontSize: 9, color: COLOR.muted, marginTop: 1.5 },

  /* Table */
  tHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
    paddingBottom: 6,
  },
  tHeadCell: {
    fontSize: 8,
    letterSpacing: 0.6,
    color: COLOR.subtle,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  tRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLOR.hair,
    paddingVertical: 9,
  },
  cDesc: { flex: 1, paddingRight: 10 },
  cQty: { width: 44, textAlign: "right" },
  cUnit: { width: 78, textAlign: "right" },
  cAmt: { width: 84, textAlign: "right" },
  lineLabel: { fontFamily: "Helvetica-Bold", fontSize: 10, color: COLOR.ink },
  lineSub: { fontSize: 8.5, color: COLOR.muted, marginTop: 2 },
  itemRow: { flexDirection: "row", marginTop: 2 },
  itemBullet: { fontSize: 8.5, color: COLOR.subtle, width: 9 },
  itemText: { fontSize: 8.5, color: COLOR.muted, flex: 1 },
  period: { fontSize: 8.5, color: COLOR.subtle, marginTop: 3 },
  cellNum: { fontSize: 9.5, color: COLOR.body },
  cellAmt: { fontSize: 9.5, color: COLOR.ink, fontFamily: "Helvetica-Bold" },

  /* Totals */
  totals: { marginTop: 14, flexDirection: "row", justifyContent: "flex-end" },
  totalsBox: { width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  totalLabel: { fontSize: 9.5, color: COLOR.muted },
  totalValue: { fontSize: 9.5, color: COLOR.body },
  grandLabel: { fontSize: 10.5, color: COLOR.ink, fontFamily: "Helvetica-Bold" },
  grandValue: { fontSize: 12, color: COLOR.ink, fontFamily: "Helvetica-Bold" },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLOR.border,
  },
  paidBox: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLOR.hair },

  /* Pay + notes */
  panel: {
    marginTop: 20,
    backgroundColor: COLOR.panel,
    borderRadius: 4,
    padding: 12,
  },
  payGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  payItem: { width: "50%", marginTop: 6 },
  payLabel: { fontSize: 8, color: COLOR.subtle },
  payValue: { fontSize: 9.5, color: COLOR.ink, marginTop: 1 },
  notes: { fontSize: 9, color: COLOR.muted, marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 46,
    right: 46,
    borderTopWidth: 1,
    borderTopColor: COLOR.hair,
    paddingTop: 8,
  },
  footerText: { fontSize: 8, color: COLOR.subtle },
});

function periodLabel(start: Date | null, end: Date | null): string | null {
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  if (start) return formatDate(start);
  if (end) return formatDate(end);
  return null;
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function Party({
  heading,
  name,
  abn,
  address,
  email,
}: {
  heading: string;
  name: string;
  abn: string | null;
  address: string | null;
  email: string | null;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.partyName}>{name}</Text>
      {abn ? <Text style={styles.partyLine}>ABN {abn}</Text> : null}
      {address ? <Text style={styles.partyLine}>{address}</Text> : null}
      {email ? <Text style={styles.partyLine}>{email}</Text> : null}
    </View>
  );
}

function InvoicePdf({ invoice }: { invoice: InvoiceDetail }) {
  const currency = invoice.currency;
  const isTaxInvoice = invoice.taxMode !== "none";
  const balanceDueCents = invoice.totalCents - invoice.amountPaidCents;
  const bd = invoice.bankDetails;
  const hasBank = Boolean(bd.bankName || bd.bsb || bd.accountName || bd.accountNumber);

  return (
    <Document
      title={`${invoice.number} — ${invoice.sellerName}`}
      author={invoice.sellerName}
      subject={isTaxInvoice ? "Tax invoice" : "Invoice"}
    >
      <Page size="A4" style={styles.page}>
        {/* Header — seller letterhead left, document identity right. */}
        <View style={styles.headerRow}>
          <View style={{ maxWidth: 260 }}>
            <Text style={styles.sellerName}>{invoice.sellerName}</Text>
            {invoice.sellerAbn ? (
              <Text style={styles.sellerLine}>ABN {invoice.sellerAbn}</Text>
            ) : null}
            {invoice.sellerAddress ? (
              <Text style={styles.sellerLine}>{invoice.sellerAddress}</Text>
            ) : null}
            {invoice.sellerEmail ? (
              <Text style={styles.sellerLine}>{invoice.sellerEmail}</Text>
            ) : null}
          </View>

          <View style={styles.titleBlock}>
            <Text style={styles.title}>{isTaxInvoice ? "Tax Invoice" : "Invoice"}</Text>
            <MetaLine label="Number" value={invoice.number} />
            <MetaLine label="Issued" value={formatDate(invoice.issueDate)} />
            {invoice.dueDate ? <MetaLine label="Due" value={formatDate(invoice.dueDate)} /> : null}
            {invoice.poNumber ? <MetaLine label="PO number" value={invoice.poNumber} /> : null}
          </View>
        </View>

        <View style={styles.rule} />

        {/* Bill to */}
        <Party
          heading="Bill to"
          name={invoice.billToName}
          abn={invoice.billToAbn}
          address={invoice.billToAddress}
          email={invoice.billToEmail}
        />

        {/* Lines */}
        <View style={[styles.section, { marginTop: 22 }]}>
          <View style={styles.tHead}>
            <Text style={[styles.tHeadCell, styles.cDesc]}>Description</Text>
            <Text style={[styles.tHeadCell, styles.cQty]}>Qty</Text>
            <Text style={[styles.tHeadCell, styles.cUnit]}>Unit price</Text>
            <Text style={[styles.tHeadCell, styles.cAmt]}>Amount</Text>
          </View>

          {invoice.lines.map((line) => {
            const items = line.details
              ? line.details.split("\n").filter((i) => i.trim())
              : [];
            const period = periodLabel(line.periodStart, line.periodEnd);
            return (
              <View key={line.id} style={styles.tRow} wrap={false}>
                <View style={styles.cDesc}>
                  <Text style={styles.lineLabel}>{line.label}</Text>
                  {line.description ? <Text style={styles.lineSub}>{line.description}</Text> : null}
                  {items.map((item, index) => (
                    <View key={`${line.id}-${index}`} style={styles.itemRow}>
                      <Text style={styles.itemBullet}>•</Text>
                      <Text style={styles.itemText}>{item}</Text>
                    </View>
                  ))}
                  {period ? <Text style={styles.period}>{period}</Text> : null}
                </View>
                <Text style={[styles.cellNum, styles.cQty]}>{line.quantity}</Text>
                <Text style={[styles.cellNum, styles.cUnit]}>
                  {formatMoney(line.unitAmountCents, currency)}
                </Text>
                <Text style={[styles.cellAmt, styles.cAmt]}>
                  {formatMoney(line.amountCents, currency)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            {invoice.taxMode === "none" ? null : (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalValue}>{formatMoney(invoice.subtotalCents, currency)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    {invoice.taxMode === "inclusive"
                      ? `Includes GST (${formatTaxRate(invoice.taxRateBps)})`
                      : `GST (${formatTaxRate(invoice.taxRateBps)})`}
                  </Text>
                  <Text style={styles.totalValue}>{formatMoney(invoice.taxCents, currency)}</Text>
                </View>
              </>
            )}

            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>
                {invoice.taxMode === "inclusive" ? "Total (GST incl.)" : "Total"}
              </Text>
              <Text style={styles.grandValue}>{formatMoney(invoice.totalCents, currency)}</Text>
            </View>

            {invoice.amountPaidCents > 0 ? (
              <View style={styles.paidBox}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Amount paid</Text>
                  <Text style={styles.totalValue}>
                    - {formatMoney(invoice.amountPaidCents, currency)}
                  </Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.grandLabel}>Balance due</Text>
                  <Text style={styles.grandLabel}>{formatMoney(balanceDueCents, currency)}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {/* Notes */}
        {invoice.notes ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Notes</Text>
            <Text style={styles.notes}>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* How to pay */}
        {hasBank && balanceDueCents > 0 ? (
          <View style={styles.panel}>
            <Text style={styles.heading}>How to pay</Text>
            <Text style={styles.notes}>
              Pay by electronic transfer. Use {invoice.number} as the reference.
            </Text>
            <View style={styles.payGrid}>
              {bd.bankName ? (
                <View style={styles.payItem}>
                  <Text style={styles.payLabel}>Bank</Text>
                  <Text style={styles.payValue}>{bd.bankName}</Text>
                </View>
              ) : null}
              {bd.accountName ? (
                <View style={styles.payItem}>
                  <Text style={styles.payLabel}>Account name</Text>
                  <Text style={styles.payValue}>{bd.accountName}</Text>
                </View>
              ) : null}
              {bd.bsb ? (
                <View style={styles.payItem}>
                  <Text style={styles.payLabel}>BSB</Text>
                  <Text style={styles.payValue}>{bd.bsb}</Text>
                </View>
              ) : null}
              {bd.accountNumber ? (
                <View style={styles.payItem}>
                  <Text style={styles.payLabel}>Account number</Text>
                  <Text style={styles.payValue}>{bd.accountNumber}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Footer — fixed on every page. */}
        {bd.invoiceFooter ? (
          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>{bd.invoiceFooter}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

/** Render one invoice to a PDF buffer. Node runtime only (the /pdf routes). */
export function renderInvoicePdf(invoice: InvoiceDetail): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf invoice={invoice} />);
}
