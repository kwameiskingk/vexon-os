// On-screen replica of Marcus's invoice template, so the Invoices page shows
// the sheet as it will print while the form is being filled. The real PDF is
// drawn server-side (supabase/functions/_shared/client-invoice-pdf.ts); this
// mirrors its layout with the same fonts (served from /brand/invoice).

import {
  computeInvoiceTotals, fmtGBP, INVOICE_BANK, INVOICE_ISSUER, ukDate,
} from "@/lib/invoices/invoiceMaths";

export interface InvoicePaperProps {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  billToName: string;
  billToAddress: string;
  lineDescription: string;
  amountExVat: number;
  vatRate: number;
}

const FONT_CSS = `
@font-face { font-family: "MeridianInvoice"; src: url("/brand/invoice/Roboto-Regular.ttf") format("truetype"); font-weight: 400; }
@font-face { font-family: "MeridianInvoice"; src: url("/brand/invoice/Roboto-Bold.ttf") format("truetype"); font-weight: 700; }
@font-face { font-family: "MeridianInvoiceTitle"; src: url("/brand/invoice/MerriweatherBlack.ttf") format("truetype"); font-weight: 900; }
`;

export function InvoicePaper(p: InvoicePaperProps) {
  const t = computeInvoiceTotals(p.amountExVat, p.vatRate);
  const vatLabel = `VAT (${Number.isInteger(t.rate) ? t.rate : t.rate.toFixed(1)}%)`;
  const addressLines = p.billToAddress.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const cell = "border border-black px-[5pt] py-[4pt] align-top";
  return (
    <div
      className="relative mx-auto bg-white text-black shadow-lg"
      style={{ width: 612, minHeight: 792, padding: 36, fontFamily: '"MeridianInvoice", Roboto, Arial, sans-serif', fontSize: 9, lineHeight: "12.4px" }}
    >
      <style>{FONT_CSS}</style>
      <img src="/brand/invoice/vexon-logo.png" alt="Vexon OS" style={{ position: "absolute", left: 348, top: 15, width: 243 }} />
      <h1 style={{ fontFamily: '"MeridianInvoiceTitle", "Merriweather Black", Georgia, serif', fontSize: 20, lineHeight: "29px", margin: "0 0 2px", fontWeight: 900 }}>Invoice</h1>

      <div style={{ display: "grid", gridTemplateColumns: "66px auto", rowGap: 0 }}>
        <span className="font-bold">Invoice Number</span><span className="font-bold">{p.invoiceNumber}</span>
        <span>Date of issue</span><span>{ukDate(p.issueDate)}</span>
        <span>Date Due</span><span>{ukDate(p.dueDate)}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "356px 1fr", marginTop: 12.4 }}>
        <div>
          <p className="font-bold m-0">{INVOICE_ISSUER.name}</p>
          {INVOICE_ISSUER.addressLines.map((l) => <p key={l} className="m-0">{l}</p>)}
        </div>
        <div>
          <p className="font-bold m-0">Bill to</p>
          <p className="font-bold m-0 break-words">{p.billToName || <span className="text-neutral-400">Client name</span>}</p>
          {addressLines.length
            ? addressLines.map((l, i) => <p key={i} className="m-0 break-words">{l}</p>)
            : <p className="m-0 text-neutral-400">Address</p>}
        </div>
      </div>

      <table className="w-full border-collapse" style={{ marginTop: 56, tableLayout: "fixed" }}>
        <colgroup><col style={{ width: 456 }} /><col style={{ width: 84 }} /></colgroup>
        <tbody>
          <tr style={{ background: "#d9d9d9" }}><td className={cell}>Item Description</td><td className={cell}>Amount</td></tr>
          <tr><td className={cell}>{p.lineDescription}</td><td className={`${cell} text-right`}>{fmtGBP(t.net)}</td></tr>
          <tr><td className={cell}>{vatLabel}</td><td className={`${cell} text-right`}>{fmtGBP(t.vat)}</td></tr>
          <tr><td className={`${cell} text-right font-bold`}>Total Due</td><td className={`${cell} text-right`}>£<span className="font-bold">{fmtGBP(t.total).slice(1)}</span></td></tr>
        </tbody>
      </table>

      <p className="m-0" style={{ marginTop: 18 }}>Please wire funds to our banking instructions:</p>

      <table className="w-full border-collapse" style={{ marginTop: 26, tableLayout: "fixed" }}>
        <colgroup><col style={{ width: 147 }} /><col /></colgroup>
        <tbody>
          {([
            ["Name", INVOICE_BANK.name],
            ["Account Type", INVOICE_BANK.accountType],
            ["Account Number", INVOICE_BANK.accountNumber],
            ["Sort Code", INVOICE_BANK.sortCode],
            ["IBAN", INVOICE_BANK.iban],
            ["SWIFT BIC", INVOICE_BANK.swift],
          ] as const).map(([k, v], i) => (
            <tr key={k} style={{ height: i === 0 ? 24 : 12 }}>
              <td className="border border-black px-[5.4pt] py-0 align-top">{k}</td>
              <td className="border border-black px-[5.4pt] py-0 align-top">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ position: "absolute", left: 36, bottom: 36 }}>
        <p className="m-0">Company Registration Number: {INVOICE_ISSUER.companyNumber}</p>
        <p className="m-0">VAT Registration Number: {INVOICE_ISSUER.vatNumber}</p>
      </div>
    </div>
  );
}
