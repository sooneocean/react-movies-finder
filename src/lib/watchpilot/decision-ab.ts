/**
 * WatchPilot Lab A/B decisions; never delegates regional/offer/expiry constraints to AI.
 * Candidates MUST already have passed the deterministic scheduler's hard filters.
 */
export interface WatchChoice {
  id: string;
  title: string;
  genres: string[];
  runtimeMinutes: number;
  planScore: number;
  tasteScore: number;
  qualityScore: number;
  providerId: string;
  evidence: "FIXTURE" | "OBSERVED" | "VERIFIED";
}
export interface DecisionExperiment {
  prompt: string;
  dataMode: "fixture" | "research";
  candidates: WatchChoice[];
  baselinePick: string;
  qualityPick: string;
}
export interface JevDecision {
  selectedId: string;
  servedModel: string;
  confidence: number | null;
  probabilities: Record<string, number>;
  inputTokens: number | null;
}
export interface JevRequestBody {
  model: "jev-latest";
  state: { userIntent: string; locale: "zh-TW"; choices: { code: string; title: string; genres: string[]; durationMinutes: number; provider: string }[] };
  questions: { tonight: { type: "choice"; instructions: string; criteria: Record<string, string> } };
}
function validScore(n: number) { return Number.isFinite(n) && n >= 0 && n <= 100; }
function textLimit(s: string, max: number) { return typeof s === "string" && s.trim().length > 0 && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s); }
export function createExperiment(prompt: string, candidates: WatchChoice[], dataMode: "fixture" | "research"): DecisionExperiment {
  if (!textLimit(prompt, 400)) throw new Error("Invalid research intent");
  if (dataMode !== "fixture" && dataMode !== "research") throw new Error("Invalid data mode");
  if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 6) throw new Error("Need 2–6 prequalified choices");
  const ids = new Set<string>();
  for (const c of candidates) {
    if (!textLimit(c.id, 64) || !/^[a-zA-Z0-9:_-]+$/.test(c.id) || ids.has(c.id) ||
      !textLimit(c.title, 120) || !textLimit(c.providerId, 80) ||
      !Array.isArray(c.genres) || c.genres.length > 12 || c.genres.some(g => !textLimit(g, 50)) ||
      !Number.isInteger(c.runtimeMinutes) || c.runtimeMinutes < 20 || c.runtimeMinutes > 600 ||
      !validScore(c.planScore) || !validScore(c.tasteScore) || !validScore(c.qualityScore) ||
      (dataMode === "fixture" && c.evidence !== "FIXTURE") ||
      (dataMode === "research" && c.evidence === "FIXTURE")) {
      throw new Error("Invalid or duplicate candidate");
    }
    ids.add(c.id);
  }
  const sorted = (key: "planScore" | "qualityScore") => [...candidates].sort((a,b) => b[key] - a[key] || a.id.localeCompare(b.id))[0].id;
  return { prompt, dataMode, candidates: candidates.map(x=>({ ...x, genres: [...x.genres] })), baselinePick: sorted("planScore"), qualityPick: sorted("qualityScore") };
}
/** Raw HTTP contract per TypeSafe System One /v1/systemone API. */
export function makeJevRequest(exp: DecisionExperiment): { body: JevRequestBody; labels: Record<string,string> } {
  const checked = createExperiment(exp.prompt, exp.candidates, exp.dataMode);
  const labels: Record<string,string> = {};
  const criteria: Record<string,string> = {};
  const choices = checked.candidates.map((c,i) => {
    const code = "opt_" + (i + 1);
    labels[code] = c.id;
    criteria[code] = c.title + "；類型：" + (c.genres.join("、") || "未知") + "；片長" + c.runtimeMinutes + "分鐘；平台" + c.providerId;
    return { code, title: c.title, genres: c.genres, durationMinutes: c.runtimeMinutes, provider: c.providerId };
  });
  return {
    labels,
    body: {
      model: "jev-latest",
      state: { userIntent: checked.prompt, locale: "zh-TW", choices },
      questions: {
        tonight: {
          type: "choice",
          instructions: "你在這幾部已通過地區、可看權益、時間與排除條件驗證的候選電影中，選擇最符合使用者今晚觀看意圖的一部。只根據提供的內容判斷個人口味；不要推測串流版權、官方下架日或未提供的電影事實。",
          criteria,
        },
      },
    },
  };
}
/** Server must reject unknown chosen codes; never label invalid output as Jev success. */
export function parseJevDecision(raw: unknown, labels: Record<string,string>): JevDecision {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Jev payload");
  const value = raw as Record<string, unknown>;
  const answers = value.answers;
  if (!answers || typeof answers !== "object") throw new Error("Missing Jev answer");
  const choice = (answers as Record<string, unknown>).tonight;
  if (!choice || typeof choice !== "object") throw new Error("Missing Jev choice");
  const result = choice as Record<string, unknown>;
  const code = result.choice;
  if (typeof code !== "string" || !Object.hasOwn(labels, code)) throw new Error("Jev selected an ineligible option");
  const servedModel = value.model;
  if (typeof servedModel !== "string" || servedModel.length > 120 || !servedModel) throw new Error("Missing served model");
  const confidence = result.confidence;
  if (confidence !== null && confidence !== undefined && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error("Invalid confidence");
  const source = result.probabilities;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Missing probabilities");
  const probabilities: Record<string,number> = {};
  for (const [key, prob] of Object.entries(source as Record<string,unknown>)) {
    if (!Object.hasOwn(labels,key) || typeof prob !== "number" || !Number.isFinite(prob) || prob < 0 || prob > 1) throw new Error("Invalid probabilities");
    probabilities[labels[key]] = prob;
  }
  if (Object.keys(probabilities).length !== Object.keys(labels).length) throw new Error("Incomplete probability distribution");
  const usage = value.usage;
  const input = usage && typeof usage === "object" ? (usage as Record<string,unknown>).input_tokens : null;
  return {
    selectedId: labels[code], servedModel,
    confidence: typeof confidence === "number" ? confidence : null,
    probabilities,
    inputTokens: typeof input === "number" && Number.isSafeInteger(input) && input >= 0 ? input : null,
  };
}
