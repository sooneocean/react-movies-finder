import {makeJevRequest,parseJevDecision,type DecisionExperiment,type JevDecision} from './decision-ab.ts';

export class JevEvaluationError extends Error {
  public readonly code: 'DISABLED'|'NO_KEY'|'RATE_LIMITED'|'UPSTREAM'|'BAD_RESPONSE';
  public readonly status: number;
  constructor(code: 'DISABLED'|'NO_KEY'|'RATE_LIMITED'|'UPSTREAM'|'BAD_RESPONSE', status: number) {
    super(code);
    this.code=code; this.status=status;
    this.name='JevEvaluationError';
  }
}
/**
 * Explicitly opt-in. Each invocation potentially bills the caller.
 * One HTTP request, no silent retry, no key returned or logged.
 * Only pass the bounded, pre-qualified candidate fields.
 */
export async function evaluateWithJev(
  experiment: DecisionExperiment,
  options: {enabled: boolean; apiKey?: string; fetcher?: typeof fetch; timeoutMs?: number},
): Promise<JevDecision> {
  if (!options.enabled) throw new JevEvaluationError('DISABLED',403);
  const key=options.apiKey?.trim();
  if (!key || key.length < 6 || key.startsWith('your_')) throw new JevEvaluationError('NO_KEY',503);
  const {body,labels}=makeJevRequest(experiment);
  const timeoutMs=options.timeoutMs ?? 12_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 20_000) throw new Error('Invalid timeout');
  let response: Response;
  try {
    response=await (options.fetcher ?? fetch)('https://api.typesafe.ai/v1/systemone',{
      method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new JevEvaluationError('UPSTREAM',502);
  }
  if (response.status===429) throw new JevEvaluationError('RATE_LIMITED',429);
  if (!response.ok) throw new JevEvaluationError('UPSTREAM',502);
  let raw: unknown;
  try { raw=await response.json(); } catch { throw new JevEvaluationError('BAD_RESPONSE',502); }
  try { return parseJevDecision(raw,labels); } catch { throw new JevEvaluationError('BAD_RESPONSE',502); }
}
