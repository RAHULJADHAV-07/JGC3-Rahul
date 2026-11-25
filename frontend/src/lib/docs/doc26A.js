import { awb26aRows } from "./common.js";
import { shippingInstructions, si26Sheet } from "./doc26.js";

/* 26A · AWB instructions — the air counterpart of 26: the booking form the
   forwarder drafts the air waybill from (Docs/JG_Air_Docs/AWB Format.xls), laid
   out by the same three renderers so the preview, the PDF and the .xlsx agree. */
export const B_26A = (ctx) => ({
  name: "AWB_Instructions",
  html: shippingInstructions(ctx, awb26aRows),
  sheet: si26Sheet(ctx, "AWB Instructions", awb26aRows),
  page: "portrait",
});
