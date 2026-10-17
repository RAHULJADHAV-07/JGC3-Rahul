/* What changed, release by release.

   The newest release goes first. `APP_VERSION` is what the footer, the sign-in
   screen and the one-time "what's new" popup all read, so a release is one
   edit here: bump the version and put its notes at the top of the list.
   Each note is one line — what the change is, in the words the office uses. */

export const RELEASES = [
  {
    version: "7.2.0",
    date: "2026-10-07",
    notes: [
      "Supplier papers (7, 8, 9) list only the POs each line's boxes cleared.",
      "Maharashtra suppliers: CGST + SGST; others: IGST (docs 6, 8, 10).",
      "No length printed for PP and PA moulded fittings (18, 19, 20, 31, 32).",
      "Packing list shows bundled goods as “1800 (BUNDLES)”.",
      "Weight break-up only when the shipment has corrugated boxes.",
      "BL annexure sizes fixed — inch sizes no longer read as 12MM, 114MM.",
      "Declarations 13–16 print as a full A4 page, footer at the foot.",
      "Document previews fit the screen — no sideways scroll or blank band.",
      "Long text squeezes to fit its cell instead of being cut off.",
      "PDFs no longer spill a few lines onto an extra page.",
    ],
  },
  {
    version: "7.1.0",
    date: "2026-10-05",
    notes: [
      "Dropdowns line up with the fields and buttons beside them.",
      "Filter bars stay on one line; hints no longer drop under a dropdown.",
      "Dropdowns show their whole label, at the width they had before.",
      "Clicking a dropdown no longer leaves a glow ring on it.",
      "Pages no longer shift sideways when a scrollbar appears.",
      "Slim scrollbars in the app's colours on Firefox too.",
      "PO-wise report: one invoice per line, so the table fits the screen.",
      "Each documents menu opens on its own first paper.",
      "“Server is starting up” instead of “Bad Gateway” during an update.",
    ],
  },
  {
    version: "7.0.0",
    date: "2026-10-05",
    notes: [
      "Dashboard CNTRS = pending volume ÷ 30, to 3 decimals.",
      "Scroll wide tables sideways from the top bar too.",
      "Clicking a PO on the dashboard opens that PO.",
      "Carton range column removed from the PO detail.",
      "Nett and gross weights shown to 3 decimals.",
      "Supplier filter on every report; “All” follows the item sequence.",
      "Item sequence: Oswin by bore, VP-PP, Hansa-PP, Hansa-GRN, VP-GRN.",
      "Record packing numbers cartons in that sequence.",
      "Unticked item columns are left out of reports and downloads.",
      "Setup → Additional settings: terms, packaging, ports and banks.",
      "Shipment details & record packing pick these from lists.",
      "New fields: proforma no./date, carting date, booking no.",
      "Buyers can have several ports; suppliers carry a GST %.",
      "Items carry a packaging type (existing items: Cartons).",
      "Profile menu: full name, role, theme and sign out.",
      "Users are created with a first and last name.",
      "Each PO line shows the invoices that cleared it.",
      "Styled dropdowns and calendars; phone layout fixes.",
    ],
  },
];

export const APP_VERSION = RELEASES[0].version;

/* The way the footer and the sign-in screen write it. */
export const versionLabel = (v = APP_VERSION) => `V-${v}`;
