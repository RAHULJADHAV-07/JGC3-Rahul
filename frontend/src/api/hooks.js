/* React Query hooks — the components' single door to server state.
   A tiny factory gives every master the same list/create/update/delete hooks,
   with cache invalidation wired so the UI refreshes after every mutation. */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import * as api from "./endpoints.js";
import { notifyError } from "../lib/errorBus.js";
import { MODE_LISTS } from "../lib/modes.js";

/* A save with no form of its own to show a failure in says so in a toast. */
const loud = { onError: notifyError };

/* Setup is often open in one tab and the shipment in another, or on someone
   else's computer. What Setup holds is read again on coming back to a tab, once
   it is more than a few seconds old, so a list added there shows up here. */
const LIVE = { refetchOnWindowFocus: true };

function crudHooks(key, resource, extraInvalidate = []) {
  const useList = () => useQuery({ queryKey: [key], queryFn: resource.list, ...LIVE });
  const useInvalidate = () => {
    const qc = useQueryClient();
    return () => {
      qc.invalidateQueries({ queryKey: [key] });
      extraInvalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    };
  };
  const useCreate = () => {
    const invalidate = useInvalidate();
    return useMutation({ mutationFn: (body) => resource.create(body), onSuccess: invalidate });
  };
  const useUpdate = () => {
    const invalidate = useInvalidate();
    return useMutation({ mutationFn: ({ id, body }) => resource.update(id, body), onSuccess: invalidate });
  };
  const useRemove = () => {
    const invalidate = useInvalidate();
    return useMutation({ mutationFn: (id) => resource.remove(id), onSuccess: invalidate });
  };
  return { useList, useCreate, useUpdate, useRemove };
}

/* Everything worked out from the allocation ledger — the order book against
   the boxes packed. Saving an order or an invoice moves all of it: which is why
   the documents' PO columns, the registers and doc 38 read one list, not three
   that drift apart. */
const LEDGER = ["dashboard", "badges", "po-list", "po-lines", "invoices", "item-detail", "balance",
  "supply-details", "order-lines", "master-2a", "master-7a", "price-drift", "pending-for-item",
  "alloc-preview", "open-orders"];

// Masters — mutations also refresh dependent computed views.
const DERIVED = [...LEDGER, "item-groups", "items-grouped", "derive", "cost-preview"];

export const {
  useList: useSuppliers, useCreate: useCreateSupplier,
  useUpdate: useUpdateSupplier, useRemove: useDeleteSupplier,
} = crudHooks("suppliers", api.suppliers, [...DERIVED, "options"]); // the sequence follows the suppliers

export const {
  useList: useBuyers, useCreate: useCreateBuyer,
  useUpdate: useUpdateBuyer, useRemove: useDeleteBuyer,
} = crudHooks("buyers", api.buyers, [...DERIVED, "options"]); // an unsaved port list is read off the buyers

const itemHooks = crudHooks("items", api.items, [...DERIVED, "options"]); // likewise packaging types
export const { useCreate: useCreateItem, useUpdate: useUpdateItem, useRemove: useDeleteItem } = itemHooks;

/* Items take optional server-side filters — { supplier_id, group, q }. The
   filters are part of the cache key, so switching supplier is instant once
   seen and a mutation still invalidates every variation. */
/* A changed filter keeps the last answer on screen (marked as placeholder)
   until the new one lands, so a list never flashes "no item matches" while
   the search is still running — see ResultState. */
export const useItems = (params) =>
  useQuery({ queryKey: ["items", params || {}], queryFn: () => api.items.list(params), placeholderData: keepPreviousData, ...LIVE });

export const useItemGroups = () =>
  useQuery({ queryKey: ["item-groups"], queryFn: api.items.groups });

/* The master keyed the way an order is placed — one product, then the
   suppliers who make it. */
export const useGroupedItems = (params) =>
  useQuery({ queryKey: ["items-grouped", params || {}], queryFn: () => api.items.grouped(params), placeholderData: keepPreviousData, ...LIVE });

export const {
  useList: useTransports, useCreate: useCreateTransport,
  useUpdate: useUpdateTransport, useRemove: useDeleteTransport,
} = crudHooks("transports", api.transports, DERIVED);

/* Master workbook — what the bundled extract holds, loading it into the
   database, and the 2A / 7A figures for a set of ordered quantities. The
   derivation is asked of the API rather than repeated in the browser, so a
   screen can never show a number the backend would not agree with. */
export const useMastersSeed = () =>
  useQuery({ queryKey: ["masters-seed"], queryFn: api.masters.seed, staleTime: Infinity });

export const useMasterFormulas = () =>
  useQuery({ queryKey: ["master-formulas"], queryFn: api.masters.formulas, staleTime: Infinity });

export function useImportMasters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overwrite) => api.masters.import(overwrite),
    ...loud,
    onSuccess: () => ["items", "item-groups", "suppliers", "buyers", "transports", "options", ...DERIVED]
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

/* `rows` is [{ item_id, qty, rbi }]. Disabled while empty so an untouched
   order form makes no request. */
export const useDerive = (rows) =>
  useQuery({
    queryKey: ["derive", rows],
    queryFn: () => api.masters.derive(rows),
    enabled: Array.isArray(rows) && rows.length > 0,
    placeholderData: (prev) => prev,
  });

/* The two master sheets themselves — 2A for a buyer order, 7A for a
   supplier's whole open book. */
export const useOrderMaster = (po) =>
  useQuery({ queryKey: ["master-2a", po], queryFn: () => api.masters.order(po), enabled: !!po });

export const useOrderLines = (range) =>
  useQuery({ queryKey: ["order-lines", range || {}], queryFn: () => api.masters.orderLines(range) });

export const useSupplierMaster = (supplierId, range) =>
  useQuery({
    queryKey: ["master-7a", supplierId, range || {}],
    queryFn: () => api.masters.supplier(supplierId, range),
    enabled: !!supplierId,
  });

// Purchase orders
export const usePoList = () => useQuery({ queryKey: ["po-list"], queryFn: api.purchaseOrders.list });
export const usePoLines = () => useQuery({ queryKey: ["po-lines"], queryFn: api.purchaseOrders.lines });
export function usePoMutations() {
  const qc = useQueryClient();
  const invalidate = () => LEDGER.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    create: useMutation({ mutationFn: api.purchaseOrders.create, onSuccess: invalidate, ...loud }),
    update: useMutation({ mutationFn: ({ po, body }) => api.purchaseOrders.update(po, body), onSuccess: invalidate, ...loud }),
    remove: useMutation({ mutationFn: (po) => api.purchaseOrders.remove(po), onSuccess: invalidate, ...loud }),
  };
}

// Invoices
export const useInvoices = () => useQuery({ queryKey: ["invoices"], queryFn: api.invoices.list });
export function useInvoiceMutations() {
  const qc = useQueryClient();
  // "options": an unsaved list of terms or ports is read off the invoices.
  const invalidate = () => [...LEDGER, "options"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    create: useMutation({ mutationFn: api.invoices.create, onSuccess: invalidate, ...loud }),
    update: useMutation({ mutationFn: ({ id, body }) => api.invoices.update(id, body), onSuccess: invalidate, ...loud }),
    remove: useMutation({ mutationFn: (id) => api.invoices.remove(id), onSuccess: invalidate, ...loud }),
  };
}

/* What record packing shows under each box it is typed into: the orders those
   boxes clear, worked out by the API's own FIFO ledger at the invoice's date
   (a back-dated invoice clears ahead of later ones — only the ledger knows
   what that leaves). Disabled until something has been typed. */
export const useAllocationPreview = (body) =>
  useQuery({
    queryKey: ["alloc-preview", body],
    queryFn: () => api.invoices.allocationPreview(body),
    enabled: !!body && Array.isArray(body.lines) && body.lines.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });

/* Custom PO: the orders still holding these items, oldest first. Given an
   invoice being edited, its own boxes count as free. Disabled until something
   has been typed. */
export const useOpenOrders = (itemIds, excludeInvoiceId) =>
  useQuery({
    queryKey: ["open-orders", itemIds, excludeInvoiceId || null],
    queryFn: () => api.invoices.openOrders({ item_ids: itemIds, exclude_invoice_id: excludeInvoiceId || null }),
    enabled: Array.isArray(itemIds) && itemIds.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 0,
  });

// Derived / reports
export const useDashboardMatrix = () => useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard.matrix });

/* Clearing a filled order off the balance board, and putting it back. Nothing
   is deleted: only the dashboard's own view of the order book moves, so the
   matrix is all that has to be refetched. */
export function useHiddenPoMutations() {
  const qc = useQueryClient();
  const invalidate = () => ["dashboard", "hidden-pos"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    hide: useMutation({ mutationFn: (pos) => api.dashboard.hidePos(pos), onSuccess: invalidate, ...loud }),
    restore: useMutation({ mutationFn: (pos) => api.dashboard.restorePos(pos), onSuccess: invalidate, ...loud }),
  };
}

/* The three counters the menu bar carries. Refetched after any mutation that
   could move them, so a badge never lies about what is still open. */
export const useBadges = () => useQuery({ queryKey: ["badges"], queryFn: api.dashboard.badges });
export const useItemDetail = () => useQuery({ queryKey: ["item-detail"], queryFn: api.reports.itemDetail });
export const useBalance = () => useQuery({ queryKey: ["balance"], queryFn: api.reports.balance });

/* Doc 38 — supply details, item wise / supplier wise. The filters are part of
   the cache key, so flipping between PO and invoice is instant once seen. */
export const useSupplyDetails = (params) =>
  useQuery({
    queryKey: ["supply-details", params || {}],
    queryFn: () => api.reports.supplyDetails(params),
    placeholderData: (prev) => prev,
  });

/* How many still-open order lines are priced at something the item master no
   longer says. Pass { item_id } to ask about a single product. */
export const usePriceDrift = (params) =>
  useQuery({ queryKey: ["price-drift", params || {}], queryFn: () => api.purchaseOrders.priceDrift(params) });

/* Which orders still have this item outstanding — shown beside the "apply to
   pending orders" tick in the edit form, so the effect is visible first. */
export const usePendingForItem = (itemId) =>
  useQuery({
    queryKey: ["pending-for-item", itemId],
    queryFn: () => api.purchaseOrders.pendingForItem(itemId),
    enabled: !!itemId,
  });

export function useApplyPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params) => api.purchaseOrders.applyPrices(params),
    ...loud,
    onSuccess: () => ["price-drift", "pending-for-item", "po-list", "po-lines", "order-lines",
      "master-2a", "master-7a", "item-detail", "balance", "supply-details", "dashboard"]
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

/* Setup → Additional settings. One query carries every list, because the
   forms that use them (shipment details, record packing, the item form) want
   several at once. Saving any of them refreshes it — and the reports, which
   are sorted in the item sequence it carries. */
export const useOptions = () =>
  useQuery({ queryKey: ["options"], queryFn: api.options.all, staleTime: 5_000, ...LIVE });

/* Saving one list. The API answers with the list as saved, and that answer is
   written into the cached lists at once — the screen shows the change the
   moment the save lands, instead of a round trip later when the refetch the
   invalidation starts comes back. Each caller gets a mutation of its own, so
   two lists saved at once do not wait on each other. */
export function useSaveList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, values, renames, modes }) => api.options.saveList(key, values, renames, modes),
    onSuccess: (out, { key }) => {
      qc.setQueryData(["options"], (old) => (old ? {
        ...old,
        [key]: Array.isArray(out?.values) ? out.values : old[key],
        ...(MODE_LISTS.includes(key) && out?.modes ? { modes: { ...(old.modes || {}), [key]: out.modes } } : {}),
      } : old));
      ["options", "buyers", "items", "invoices"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });
}

export function useOptionMutations() {
  const qc = useQueryClient();
  /* A list entry corrected or removed is carried by the API onto the buyers,
     items and open invoices that picked it, so those are read again as well. */
  const invalidate = () => ["options", "buyers", "items", "invoices"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  /* The sequence and the item groups reorder every list the API returns, so
     those are refetched with them. */
  const resequence = () => ["options", "items", "items-grouped", "po-list", "item-detail", "balance", "supply-details",
    "master-2a", "master-7a", "order-lines", "derive"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    saveList: useSaveList(),
    addBank: useMutation({ mutationFn: api.options.addBank, onSuccess: invalidate }),
    updateBank: useMutation({ mutationFn: ({ id, body }) => api.options.updateBank(id, body), onSuccess: invalidate }),
    removeBank: useMutation({ mutationFn: (id) => api.options.removeBank(id), onSuccess: invalidate }),
    saveSequence: useMutation({ mutationFn: (values) => api.options.saveSequence(values), onSuccess: resequence, ...loud }),
    saveGroups: useMutation({ mutationFn: (ranges) => api.options.saveGroups(ranges), onSuccess: resequence, ...loud }),
  };
}

/* The item master's saved column layout (Setup → Items → Customise columns).
   Every report and download leaves out the item fields it has unticked. */
export const useItemColumns = () =>
  useQuery({ queryKey: ["item-columns"], queryFn: api.options.itemColumns, staleTime: 5_000, ...LIVE });

export function useSaveItemColumns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cols) => api.options.saveItemColumns(cols),
    ...loud,
    onSuccess: (data) => qc.setQueryData(["item-columns"], data),
  });
}

/* Setup → Document columns: which columns each document hides or deletes
   (lib/docColumns.js). Every paper built in the app reads it. */
export const useDocColumns = () =>
  useQuery({ queryKey: ["doc-columns"], queryFn: api.options.docColumns, staleTime: 5_000, ...LIVE });

export function useSaveDocColumns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules) => api.options.saveDocColumns(rules),
    onSuccess: (data) => qc.setQueryData(["doc-columns"], data),
  });
}

// Users — admin only; the query is disabled for everyone else so a
// non-admin never fires a request the API would refuse.
export const useUsers = (enabled = true) =>
  useQuery({ queryKey: ["users"], queryFn: api.users.list, enabled });

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });
  return {
    create: useMutation({ mutationFn: api.users.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, body }) => api.users.update(id, body), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id) => api.users.remove(id), onSuccess: invalidate }),
  };
}

// Costing — every row arrives with its worked-out `computed` block, and the
// shared parameters feed those figures, so saving them refreshes the rows.
export const useCosting = () => useQuery({ queryKey: ["costing"], queryFn: api.costing.list });
export const useCostParams = () => useQuery({ queryKey: ["cost-params"], queryFn: api.costing.params });
export const useCostFormulas = () => useQuery({ queryKey: ["cost-formulas"], queryFn: api.costing.formulas, staleTime: Infinity });

/* The live working behind the costing screen. `rows` is
   [{ item_id, price_new }]; disabled while empty so an untouched sheet makes
   no request. The arithmetic is the API's, never the browser's. */
export const useCostPreview = (rows) =>
  useQuery({
    queryKey: ["cost-preview", rows],
    queryFn: () => api.costing.preview(rows),
    enabled: Array.isArray(rows) && rows.length > 0,
    placeholderData: (prev) => prev,
  });

export function useSaveCosting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.costing.upsert,
    ...loud,
    onSuccess: () => ["costing", "cost-preview"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

export function useCostingMutations() {
  const qc = useQueryClient();
  const invalidate = () => ["costing", "cost-params"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  return {
    create: useMutation({ mutationFn: api.costing.create, onSuccess: invalidate, ...loud }),
    update: useMutation({ mutationFn: ({ id, body }) => api.costing.update(id, body), onSuccess: invalidate, ...loud }),
    remove: useMutation({ mutationFn: (id) => api.costing.remove(id), onSuccess: invalidate, ...loud }),
    saveParams: useMutation({ mutationFn: api.costing.saveParams, onSuccess: invalidate, ...loud }),
  };
}
