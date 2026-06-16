import fs from "node:fs";
import path from "node:path";

const overridesPath = path.join(process.cwd(), "data", "job-overrides.json");

export function applyJobOverride(job) {
  const overrides = getJobOverrides();
  const override = overrides[job.jobNumber] ?? overrides[job.jobId];
  if (!override) return job;
  return {
    ...job,
    soldDate: override.soldDate ?? job.soldDate,
    overrideReason: override.reason ?? "",
  };
}

let cache = null;

function getJobOverrides() {
  if (cache) return cache;
  if (!fs.existsSync(overridesPath)) {
    cache = {};
    return cache;
  }
  cache = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
  return cache;
}
