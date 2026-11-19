/* What changed, release by release.

   The newest release goes first. `APP_VERSION` is what the footer, the sign-in
   screen and the one-time "what's new" popup all read, so a release is one
   edit here: bump the version and put its notes at the top of the list.
   Each note is one line — what the change is, in the words the office uses. */

export const RELEASES = [
  {
    version: "7.7.0",
    date: "2026-11-19",
    notes: [
      "Air declarations go out signed and stamped: export value declaration (13), SCOMET (14), SDF (15) and declaration of origin (16A).",
      "Despatch instruction (11) prints portrait again when a shipment has more than one supplier.",
      "Shipment step 3 (air): new boxes for the despatch letter No. and date (11) and the letter to buyer No. and date (30) — printed at the head of each letter, or left blank to write in.",
      "Air custom invoice (18), packing list (19) and commercial invoice (31) keep the “Other Reference(s):” line.",
      "AWB instructions (26A): dimension of carton under the net weight in the weights column, port of loading as “MUMBAI, INDIA”.",
      "Air SCOMET (14): subject, ref and end use set plain, not bold.",
      "Air proforma (17): ends on the buyer's name and address lines only.",
      "Other Reports: “By item” opens first; “By purchase order” (Report 37) moved to the last tab.",
      "Number boxes no longer show the up / down arrows.",
    ],
  },
  {
    version: "7.6.0",
    date: "2026-11-17",
    notes: [
      "An air shipment's Documents show only the air set: 10, 11, 12, 13, 14, 15, 16A, 17, 18, 19, 21, 23, 26A, 30, 31, 33.",
      "Air invoices (18, 31) and packing list (19) print on one page when the goods fit, with the weights, skids, freight and FOB in the margin — as the client's air files do.",
      "Air papers show the LEN (MM) column for pipes (2\" | 300); sea papers stay without it.",
      "Air customs invoice (18): GSTIN with “w.e.f 20.01.2021”, no RoDTEP line, marks read “GDW / PERTH  NOS : 1 - 10  / 10”.",
      "Air packing list (19): pipes counted as “Qty/Box-Pcs” and “BOXES”.",
      "Air proforma (17): LEN column, “TOTAL C&F PERTH VALUE” and “SHIPMENT” month.",
      "Air packaging declaration (21, 33) and letter to buyer (30): “10 CARTONS (02 SKIDS)” / “10 Cartons PP Extruded Pipes”.",
      "AWB instructions (26A) show the gross weight above the net weight.",
      "Air despatch letter (11): reference and date left blank to write in; EVD (13) states FOB MUMBAI.",
      "E-way bill (10): GST rounded to the whole rupee, as on the portal format.",
    ],
  },
  {
    version: "7.5.0",
    date: "2026-11-16",
    notes: [
      "Setup → Additional settings: every Terms of delivery, Port of loading and Ship to port entry now says which mode of transport it serves — Water, Air, Land. A new entry asks for its mode before it can be added.",
      "Entries added before this release count as Water and are flagged — tick Air or Land on any that also serve those, or “Confirm all as Water”.",
      "Shipment step 2: pick the mode first (Water, Air, Land); only the ports of loading and ship-to ports ticked for that mode are offered. Record packing has the same mode choice.",
      "By air, step 2 asks for the airports, marks, packages, skids and weights instead of the container and seal; step 3 asks for the AWB number and date, the airline, each flight and the freight instead of the BL and vessel.",
      "Air shipments print the air papers: AWB number, airline and flights on the invoices (18, 31), packing list (19) and packaging declaration (21, 33), skid and total weights, and on CFR terms the approximate freight and FOB.",
      "New for air: AWB instructions (26A) and the declaration of origin (16A). The SCOMET declaration, despatch instruction, e-way bill, letter to the buyer and buyer's order follow the air wording.",
      "Container-only papers (BL annexure, shipping instructions, VGM, CWD) are left out of an air shipment's documents; the shipment's step 3 lists every paper it needs, each opening in Documents.",
      "Sea shipments work exactly as before.",
    ],
  },
  {
    version: "7.4.1",
    date: "2026-11-07",
    notes: [
      "Record packing: beside the booking number, choose FIFO (as before) or Custom PO.",
      "Custom PO: enter the boxes, then tick which orders they come off — only the orders holding those items are listed. Split an item across orders box by box if you need to.",
      "Custom PO boxes print on every paper, in the prices those orders agreed, and move the dashboard, the registers and the PO balances the same as FIFO. Edit invoice can change them.",
      "The menu now says “Packing”.",
      "Ship to port: every port under Setup → Additional settings is now offered on the shipment — the buyer's own ports first, the rest after them.",
      "Correcting an entry in Additional settings now follows through to the buyers, items and unshipped invoices that use it. Removing a port takes it off the buyers too. Shipped invoices stay as they went out.",
      "Correcting a bank account updates the unshipped invoices routed through it; a renamed transporter prints under the new name.",
      "A supplier added under Setup now appears in Supplier sequence and Item groups straight away.",
      "Setup kept open in another tab: come back to a screen and it picks up what changed there.",
      "An invoice number already in use is refused, instead of two invoices sharing each other's orders.",
    ],
  },
  {
    version: "7.4.0",
    date: "2026-11-03",
    notes: [
      "Carton serials stay locked once allotted — removing an item leaves its numbers unused instead of shifting the rest (i1 = 1, i3 = 3).",
      "An item added to an invoice later takes the numbers after the last one ever given; changing the serial start moves them all together.",
      "Edit invoice: overlaps are flagged before saving, and “Renumber all cartons” closes the gaps when the numbers have not gone to customs.",
      "Every paper (docs 7–9, 18, 19, 31 …) prints the same locked ranges; the shipping marks run from the first carton to the last.",
      "Setup → Additional settings → Item groups: split a supplier's range into blocks and order them, and the items inside each.",
      "Setup: “Item sequence” is now called “Supplier sequence”; Item groups sits beside it, a supplier at a time in a popup.",
      "Oswin's PMF pipes print as their own block below the rest of Oswin — on order and invoice summaries and in every download.",
      "Supplier PO (6) gives each block an annexure of its own; docs 1–5 and 7–9 head each block.",
      "Item lists show “Loading…” while they load and “No item matches” only once the search has really come back empty.",
      "Clearer screens when something goes wrong: offline, server not answering, not found, not allowed — each with a Retry.",
      "A failed save now says so on screen; a page that fails to draw no longer leaves a blank screen; unknown links show “Page not found”.",
    ],
  },
  {
    version: "7.3.2",
    date: "2026-10-24",
    notes: [
      "Only an admin can delete a purchase order or a recorded shipment (invoice).",
      "Text size now changes only the text — the screen keeps its full width.",
      "“How is this calculated?” is now a “?” — click it for the formulas in a popup.",
      "Profile menu: a gear beside your name opens Setup → Users (admins).",
      "New Jaikvin Global logo — top bar, sign-in screen and browser tab.",
      "Sign-in screen: just the logo and the form, without the blurb.",
    ],
  },
  {
    version: "7.3.1",
    date: "2026-10-18",
    notes: [
      "New buyer order: totals at the foot, one a line — pieces, boxes, volume m³, label sheets.",
      "Record packing: totals at the foot — boxes, volume m³ and the carton serials.",
      "Profile menu → Text size: five steps, from Extra small to Extra large.",
      "The text size is remembered on each computer, like the theme.",
    ],
  },
  {
    version: "7.3.0",
    date: "2026-10-18",
    notes: [
      "Setup → Document columns: hide or delete any column, paper by paper.",
      "Hiding a column offers to do the same wherever else it is printed.",
      "Packages split into cartons and HDP bundles on every paper that names them.",
      "Items packed in bundles (Setup → Items) count as bundles, not cartons.",
      "Invoices 18 and 31 show bundled goods as “1800 (BUNDLES)” too.",
      "Docs 17, 18, 19 print the proforma no. and date when the shipment has one.",
      "Despatch letter (11) and letter to buyer (30): reference and date left blank.",
      "VGM (27): verified gross mass left blank for the weighbridge figure.",
    ],
  },
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
