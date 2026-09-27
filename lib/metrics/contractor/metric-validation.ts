// Validate references and evaluate dependencies before their consumers.
export function orderMetrics<T extends { id: string; name: string; operation: string; formula?: string | null; field?: string | null }>(metrics: T[]): T[] {
  const byId = new Map(metrics.map(metric => [metric.id, metric]));
  if (byId.size !== metrics.length) throw new Error("Each metric needs a unique ID.");
  const visiting = new Set<string>(), visited = new Set<string>(), ordered: T[] = [];
  function visit(metric: T) {
    if (visited.has(metric.id)) return;
    if (visiting.has(metric.id)) throw new Error(`${metric.name}: formulas cannot reference themselves or form a circular dependency.`);
    visiting.add(metric.id);
    if (["formula", "ratio"].includes(metric.operation)) {
      const expression = metric.formula?.trim() ?? "";
      if (!expression || !/^[a-z0-9_+\-*/().\s]+$/i.test(expression)) throw new Error(`${metric.name}: enter a formula using metrics, numbers and + - * /.`);
      for (const id of expression.match(/[a-z_][a-z0-9_]*/gi) ?? []) {
        const dependency = byId.get(id);
        if (!dependency) throw new Error(`${metric.name}: unknown metric "${id}".`);
        visit(dependency);
      }
      try { Function(`"use strict"; return (${expression.replace(/[a-z_][a-z0-9_]*/gi, "1")});`); }
      catch { throw new Error(`${metric.name}: the formula is incomplete. Check its operators and parentheses.`); }
    } else if (["sum", "average"].includes(metric.operation) && !metric.field) {
      throw new Error(`${metric.name}: choose the number field to calculate.`);
    }
    visiting.delete(metric.id); visited.add(metric.id); ordered.push(metric);
  }
  metrics.forEach(visit);
  return ordered;
}
