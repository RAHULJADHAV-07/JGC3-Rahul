import { packagingDeclaration, pkd21Sheet } from "./doc21.js";

/* 33 · the buyer's copy of that same declaration. Their file is 21's form over
   again with two differences of its own: it names the goods the way the buyer's
   papers name them, and it sets the foot of the form plainly and a line earlier
   where the customs copy sets it bold. */
const BUYER = { buyer: true };

export const B_33 = (ctx) => ({
  name: "Packing_Declaration_Buyer",
  html: packagingDeclaration(ctx, BUYER),
  sheet: pkd21Sheet(ctx, "Declaration", BUYER),
  page: "portrait",
});
