import type { Candidate, Offer, PlanInput } from "./engine";

export const LAB_PROVIDERS = [
  { id: "netflix", name: "Netflix" },
  { id: "disney", name: "Disney+" },
  { id: "max", name: "HBO Max" },
  { id: "prime", name: "Prime Video" },
] as const;

export interface LabSettings {
  startDate: string;
  weeklyMinutes: number;
  subscribedProviders: string[];
  text: string;
}

const GENRE_KEYWORDS = [
  { key: "science-fiction", word: "科幻" },
  { key: "mystery", word: "懸疑" },
  { key: "crime", word: "犯罪" },
  { key: "comedy", word: "喜劇" },
  { key: "drama", word: "劇情" },
  { key: "horror", word: "恐怖" },
] as const;

export function parsePreferenceHint(text: string): {
  preferredGenres: string[];
  excludedGenres: string[];
} {
  const preferredGenres: string[] = [];
  const excludedGenres: string[] = [];
  for (const item of GENRE_KEYWORDS) {
    if (!text.includes(item.word)) continue;
    const negative = new RegExp("(?:不要|不看|不喜歡|排除|避開|不想看|拒絕)[^，。\\n]{0,8}" + item.word).test(text);
    (negative ? excludedGenres : preferredGenres).push(item.key);
  }
  return { preferredGenres, excludedGenres };
}

/** All titles, offers, and expiry dates here are synthetic research fixtures. */
export function makeLabInput(settings: LabSettings): PlanInput {
  const weeklyMinutes = Math.max(0, Math.min(40 * 60, Math.floor(settings.weeklyMinutes)));
  const days = Math.max(1, Math.min(7, Math.floor(weeklyMinutes / 135)));
  const slotMinutes = Math.floor(weeklyMinutes / days);
  const slots = Array.from({ length: days }, (_, idx) => ({
    date: addDay(settings.startDate, Math.floor((idx * 7) / days)),
    minutes: slotMinutes + (idx < weeklyMinutes % days ? 1 : 0),
  }));
  const hint = parsePreferenceHint(settings.text);
  const observedOn = settings.startDate;
  const offer = (providerId: string, expiresIn?: number, access: Offer["access"] = "subscription"): Offer => ({
    providerId, region: "TW", access, evidence: "FIXTURE",
    source: "fixture://watchpilot-lab/synthetic",
    observedOn,
    ...(expiresIn === undefined ? {} : { expiresOn: addDay(settings.startDate, expiresIn) }),
  });
  const titles: Omit<Candidate, "tasteScore"> & { taste: number }[] = [
    { id: "sample-01", title: "研究樣本A｜科幻探索", runtimeMinutes: 128, genres: ["science-fiction"], taste: 86, qualityScore: 91, offers: [offer("netflix", 2)] },
    { id: "sample-02", title: "研究樣本B｜懸疑推理", runtimeMinutes: 112, genres: ["mystery"], taste: 83, qualityScore: 87, offers: [offer("disney")] },
    { id: "sample-03", title: "研究樣本C｜犯罪劇情", runtimeMinutes: 118, genres: ["crime", "drama"], taste: 80, qualityScore: 89, offers: [offer("netflix", 5)] },
    { id: "sample-04", title: "研究樣本D｜輕鬆喜劇", runtimeMinutes: 94, genres: ["comedy"], taste: 76, qualityScore: 77, offers: [offer("max")] },
    { id: "sample-05", title: "研究樣本E｜恐怖驚悚", runtimeMinutes: 104, genres: ["horror"], taste: 79, qualityScore: 82, offers: [offer("netflix")] },
    { id: "sample-06", title: "研究樣本F｜劇情長片", runtimeMinutes: 144, genres: ["drama"], taste: 75, qualityScore: 92, offers: [offer("prime")] },
    { id: "sample-07", title: "研究樣本G｜租借限定", runtimeMinutes: 101, genres: ["science-fiction"], taste: 92, qualityScore: 90, offers: [offer("netflix", undefined, "rent")] },
    { id: "sample-08", title: "研究樣本H｜已看過", runtimeMinutes: 95, genres: ["mystery"], taste: 91, qualityScore: 85, watched: true, offers: [offer("disney")] },
  ];
  return {
    mode: "fixture", region: "TW",
    subscribedProviders: settings.subscribedProviders,
    excludedGenres: hint.excludedGenres,
    slots,
    candidates: titles.map(({ taste, ...rest }) => ({
      ...rest,
      tasteScore: Math.min(100, taste + (rest.genres.some(genre => hint.preferredGenres.includes(genre)) ? 12 : 0)),
    })),
  };
}
function addDay(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
