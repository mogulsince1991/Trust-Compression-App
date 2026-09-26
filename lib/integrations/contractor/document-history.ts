import { SALES_RULE, isSalesDocument } from "@/lib/metrics/contractor/salesDocuments.js";
import { createServiceSupabaseClient } from "@/lib/supabase";

type Query = (query: Record<string, any>) => Promise<any>;

// Fail closed on truncation or unreadable history; partial sales are not a report.
export async function readAllPages(query: Query, build: (params: any) => any, read: (response: any) => any) {
  const rows: any[] = [], cursors = new Set<string>();
  let page: string | undefined;
  for (let i = 0; i < 1000; i++) {
    const connection = read(await query(build({ size: 100, ...(page ? { page } : {}) })));
    if (!connection || !Array.isArray(connection.nodes)) throw new Error("JobTread returned an incomplete connection.");
    rows.push(...connection.nodes);
    if (!connection.nextPage) return rows;
    if (!connection.nodes.length || cursors.has(connection.nextPage)) throw new Error("JobTread pagination did not advance.");
    page = connection.nextPage; cursors.add(page!);
  }
  throw new Error("JobTread scan limit reached; no partial sales report was generated.");
}

export function documentCache(account: any) {
  const db = createServiceSupabaseClient();
  const scope = { workspace_id: account.workspace_id, connector_id: account.id, rule_version: SALES_RULE.version };
  if (!db || !scope.workspace_id || !scope.connector_id) throw new Error("Document history cache requires a connected workspace account.");
  return {
    async get(key: string, maxAge: number) {
      const { data, error } = await db.from("contractor_connector_cache").select("payload,updated_at")
        .match(scope).eq("cache_key", key).maybeSingle();
      if (error) throw error;
      return data && Date.now() - Date.parse(data.updated_at) < maxAge ? data.payload : null;
    },
    async put(key: string, payload: any) {
      const { error } = await db.from("contractor_connector_cache").upsert({ ...scope, cache_key: key, payload, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
  };
}

export async function discoverSalesDocuments(query: Query, organizationId: string, account: any) {
  const cache = documentCache(account);
  const documents = await readAllPages(query,
    params => ({ organization: { $: { id: organizationId }, documents: { $: { ...params, sortBy: [{ field: "createdAt", order: "desc" }] }, nodes: {
      id: {}, number: {}, type: {}, status: {}, name: {}, issueDate: {}, closedAt: {}, createdAt: {}, priceWithTax: {}, job: { id: {}, number: {}, name: {} },
    }, nextPage: {} } } }), response => response.organization?.documents);
  const candidates = documents.filter(doc => doc.job?.id && isSalesDocument(doc) && Number(doc.priceWithTax) > 0);
  const result: any[] = [];
  for (let offset = 0; offset < candidates.length; offset += 8) {
    result.push(...await Promise.all(candidates.slice(offset, offset + 8).map(async doc => {
      const fingerprint = JSON.stringify([doc.status,doc.closedAt,doc.issueDate,doc.createdAt,doc.priceWithTax,doc.name,doc.number]);
      const saved = await cache.get(`history:${doc.id}`, 24 * 60 * 60 * 1000);
      let history = saved?.fingerprint === fingerprint ? saved : null;
      if (!history) {
        const events = await readAllPages(query,
          params => ({ document: { $: { id: doc.id }, events: { $: { ...params, sortBy: [{ field: "createdAt", order: "asc" }] }, nodes: { type: {}, createdAt: {}, data: {} }, nextPage: {} } } }),
          response => response.document?.events);
        const approval = events.find(event => /documentUpdated/i.test(event.type ?? "") && /^approved$/i.test(event.data?.next?.status ?? "") && !/^approved$/i.test(event.data?.previous?.status ?? ""));
        history = { fingerprint, approvedAt: approval?.createdAt ?? "", events, document: doc };
        // Save each completed audit, so a retried large scan resumes safely.
        await cache.put(`history:${doc.id}`, history);
      }
      return { ...doc, historicallyApprovedAt: history.approvedAt };
    })));
  }
  return result;
}
