import { dbQuery } from "../db.js";

function dayStartUTC(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  return x.toISOString().slice(0, 10); // YYYY-MM-DD
}

function monthStartUTC(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
  return x.toISOString().slice(0, 10);
}

export async function getUsageCounters(licenseId: string) {
  const today = dayStartUTC();
  const month = monthStartUTC();
  const [dayRes, monthRes] = await Promise.all([
    dbQuery<{ requests: number }>(
      `
      SELECT COALESCE(SUM(requests),0)::int AS requests
      FROM usage_counters
      WHERE license_id=$1 AND period='day' AND period_start=$2
      `,
      [licenseId, today],
    ),
    dbQuery<{ input_tokens: number; output_tokens: number }>(
      `
      SELECT COALESCE(SUM(input_tokens),0)::int AS input_tokens,
             COALESCE(SUM(output_tokens),0)::int AS output_tokens
      FROM usage_counters
      WHERE license_id=$1 AND period='month' AND period_start=$2
      `,
      [licenseId, month],
    ),
  ]);
  return {
    requests_today: dayRes.rows[0]?.requests ?? 0,
    tokens_month: (monthRes.rows[0]?.input_tokens ?? 0) + (monthRes.rows[0]?.output_tokens ?? 0),
  };
}

export async function recordUsage(params: {
  licenseId: string;
  activationId: string | null;
  userId: string | null;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  requestId: string;
  meta?: any;
}) {
  const today = dayStartUTC();
  const month = monthStartUTC();

  await dbQuery(
    `
    INSERT INTO usage_events(license_id, activation_id, user_id, model_id, input_tokens, output_tokens, request_id, meta)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    `,
    [
      params.licenseId,
      params.activationId,
      params.userId,
      params.modelId,
      Math.max(0, params.inputTokens | 0),
      Math.max(0, params.outputTokens | 0),
      params.requestId,
      JSON.stringify(params.meta ?? {}),
    ],
  );

  // day counter (requests)
  await dbQuery(
    `
    INSERT INTO usage_counters(license_id, period, period_start, model_id, requests, input_tokens, output_tokens, cost_cents)
    VALUES ($1,'day',$2,NULL,1,0,0,0)
    ON CONFLICT (license_id, period, period_start, model_id)
    DO UPDATE SET requests = usage_counters.requests + 1
    `,
    [params.licenseId, today],
  );

  // month counter (tokens, per model)
  await dbQuery(
    `
    INSERT INTO usage_counters(license_id, period, period_start, model_id, requests, input_tokens, output_tokens, cost_cents)
    VALUES ($1,'month',$2,$3,0,$4,$5,0)
    ON CONFLICT (license_id, period, period_start, model_id)
    DO UPDATE SET input_tokens = usage_counters.input_tokens + EXCLUDED.input_tokens,
                  output_tokens = usage_counters.output_tokens + EXCLUDED.output_tokens
    `,
    [params.licenseId, month, params.modelId, Math.max(0, params.inputTokens | 0), Math.max(0, params.outputTokens | 0)],
  );
}

