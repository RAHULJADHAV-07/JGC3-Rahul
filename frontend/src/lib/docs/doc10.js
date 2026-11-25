import { ewaySupplierDocs } from "./common.js";

export const B_10 = (ctx) => {
  const docs = ewaySupplierDocs(ctx);
  return {
    name: "Eway_Purchase",
    html: docs.map((d) => d.html).join("<br>"),
    sheets: docs.map((d) => ({ ...d.sheets[0], name: docs.length > 1 ? `${d.code} E-way` : "E-way" })),
  };
};
