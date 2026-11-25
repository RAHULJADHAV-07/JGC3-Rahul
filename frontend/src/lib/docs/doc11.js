import { despatchSupplierDocs } from "./common.js";

export const B_11 = (ctx) => {
  const docs = despatchSupplierDocs(ctx);
  return {
    name: "Despatch_Instructions",
    html: docs.map((d) => d.html).join('<div class="pgbrk"></div>'),
    sheets: docs.map((d) => ({ ...d.sheets[0], name: docs.length > 1 ? `${d.code} Despatch` : "Despatch" })),
    page: "portrait",
  };
};
