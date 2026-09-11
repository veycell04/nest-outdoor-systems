export const primarySystemIds = [
  "bioclimatic_double",
  "rolling_roof",
  "tilt",
  "pvc",
  "flat",
  "glass",
  "awning",
  "wintent",
  "umbrella",
] as const;

export const addOnIds = [
  "zip",
  "ceiling_zip",
  "sliding_glass",
  "guillotine",
  "solidroll",
  "led",
] as const;

export type PrimarySystemId = (typeof primarySystemIds)[number];
export type AddOnId = (typeof addOnIds)[number];

export const primaryLabels: Record<PrimarySystemId, string> = {
  bioclimatic_double: "Louvered Pergola — Double Retracting",
  rolling_roof: "Louvered Pergola — Retracting Roof",
  tilt: "Louvered Pergola — Tilting Louvers",
  pvc: "Classic PVC Pergola",
  flat: "Flat Pergola",
  glass: "Glass Veranda",
  awning: "Cassette Awning",
  wintent: "Wintent Window Awning",
  umbrella: "Garden Umbrella",
};

export const addOnLabels: Record<AddOnId, string> = {
  zip: "Vertical ZIP Screen",
  ceiling_zip: "Ceiling ZIP Screen",
  sliding_glass: "Sliding Glass",
  guillotine: "Guillotine Glass",
  solidroll: "Solidroll",
  led: "Integrated LED Lighting",
};

export const compatibility: Record<PrimarySystemId, readonly AddOnId[]> = {
  bioclimatic_double: ["zip", "sliding_glass", "guillotine", "solidroll", "led"],
  rolling_roof: ["zip", "sliding_glass", "guillotine", "solidroll", "led"],
  tilt: ["zip", "sliding_glass", "guillotine", "solidroll", "led"],
  pvc: ["zip", "sliding_glass", "led"],
  flat: ["zip", "sliding_glass", "led"],
  glass: ["zip", "sliding_glass", "guillotine", "solidroll", "led"],
  awning: [],
  wintent: [],
  umbrella: [],
};

export const isPrimarySystemId = (id: string): id is PrimarySystemId =>
  primarySystemIds.includes(id as PrimarySystemId);

export const compatibleAddOns = (primaryId: PrimarySystemId) =>
  compatibility[primaryId];

export const reconcileAddOns = (
  primaryId: PrimarySystemId,
  selected: readonly AddOnId[],
) => selected.filter((id) => compatibility[primaryId].includes(id)).slice(0, 3);

export const toggleAddOn = (
  primaryId: PrimarySystemId,
  selected: readonly AddOnId[],
  id: AddOnId,
) => {
  if (!compatibility[primaryId].includes(id)) return [...selected];
  if (selected.includes(id)) return selected.filter((value) => value !== id);
  return selected.length < 3 ? [...selected, id] : [...selected];
};

export const usesLouverColor = (id: PrimarySystemId) =>
  id === "bioclimatic_double" || id === "rolling_roof" || id === "tilt";

export const usesFabricColor = (id: PrimarySystemId) =>
  ["pvc", "flat", "awning", "wintent", "umbrella"].includes(id);
