import { PL_FORMS } from "./common.js";
import { packingListHtml, packingListSheets } from "./doc19.js";

/* 32 · the buyer's copy of the packing list. Their file is 19's form headed
   with the buyer's own run of orders, the goods under the trade names the
   buyer's papers use, no break-up of the weights at the foot — and signed and
   stamped, because this copy goes out rather than to customs (see PL_FORMS). */
export const B_32 = (ctx) => ({
  name: "Packing_Buyer",
  html: packingListHtml(ctx, PL_FORMS[32]),
  sheets: packingListSheets(ctx, PL_FORMS[32]),
  page: "portrait",
});
