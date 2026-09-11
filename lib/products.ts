export type ProductId =
  | "bioclimatic_double" | "rolling_roof" | "tilt" | "pvc" | "flat"
  | "awning" | "zip" | "ceiling_zip" | "glass" | "guillotine"
  | "sliding_glass" | "umbrella";

export type DimensionKey = "width" | "projection" | "height" | "length";

export type ProductDefinition = {
  id: ProductId;
  label: string;
  family: string;
  details: string;
  referenceImages: string[];
  missingReference?: string;
  dimensions: DimensionKey[];
  finishes: string[];
  options: string[];
  viewer: string;
};

const pergolaReference = "/projects/elevated-pergola.jpeg";

export const products: ProductDefinition[] = [
  { id:"bioclimatic_double", label:"Louvered Pergola — Double Retracting", family:"pergola", details:"Motorized aluminum pergola with moving louvered roof, integrated drainage and optional lighting.", referenceImages:["/projects/elevated-bioclimatic-double.png"], dimensions:["width","projection","height"], finishes:["Anthracite","Bronze","White"], options:["Integrated lighting","Vertical ZIP screens","Freestanding","Wall attached"], viewer:"bioclimatic" },
  { id:"rolling_roof", label:"Louvered Pergola — Retracting Roof", family:"pergola", details:"Motorized aluminum pergola with retracting louvered roof and integrated drainage.", referenceImages:["/projects/elevated-rolling-roof.png"], dimensions:["width","projection","height"], finishes:["Anthracite","Bronze","White"], options:["Integrated lighting","Vertical ZIP screens","Freestanding","Wall attached"], viewer:"bioclimatic" },
  { id:"tilt", label:"Louvered Pergola — Tilting Louvers", family:"pergola", details:"Aluminum pergola with tilting louvers for adjustable sun and ventilation.", referenceImages:["/projects/elevated-tilt-system.png"], dimensions:["width","projection","height"], finishes:["Anthracite","Bronze","White"], options:["Integrated lighting","Vertical ZIP screens","Freestanding","Wall attached"], viewer:"bioclimatic" },
  { id:"pvc", label:"Classic PVC Pergola", family:"pergola", details:"Retractable fabric-roof pergola with an architectural aluminum frame.", referenceImages:[pergolaReference], dimensions:["width","projection","height"], finishes:["Anthracite","Bronze","White"], options:["Integrated lighting","Vertical ZIP screens","Freestanding","Wall attached"], viewer:"fabric" },
  { id:"flat", label:"Flat Pergola — Premium", family:"pergola", details:"Premium flat-profile retractable fabric pergola with aluminum structure.", referenceImages:["/projects/elevated-flat-pergola.png"], dimensions:["width","projection","height"], finishes:["Anthracite","Bronze","White"], options:["Integrated lighting","Vertical ZIP screens","Freestanding","Wall attached"], viewer:"fabric" },
  { id:"awning", label:"Cassette Awning", family:"awning", details:"Wall-mounted full-cassette retractable awning with a slim enclosed housing.", referenceImages:["/projects/elevated-cassette-awning.jpeg"], dimensions:["width","projection"], finishes:["Anthracite","Bronze","White"], options:["Integrated lighting","Motorized operation","Wind sensor"], viewer:"awning" },
  { id:"zip", label:"Vertical ZIP Screen", family:"screen", details:"Motorized vertical tension screen fitted within slim side channels.", referenceImages:["/projects/elevated-zip-screen.jpeg"], dimensions:["width","height"], finishes:["Anthracite","Bronze","White"], options:["Solar fabric","Insect screen","Motorized operation"], viewer:"zip" },
  { id:"ceiling_zip", label:"Ceiling ZIP Screen", family:"screen", details:"Horizontal tensioned fabric shade designed for overhead openings.", referenceImages:["/projects/elevated-ceiling-zip.png"], dimensions:["width","projection"], finishes:["Anthracite","Bronze","White"], options:["Solar fabric","Motorized operation"], viewer:"ceiling_zip" },
  { id:"glass", label:"Glass Veranda", family:"veranda", details:"Aluminum veranda with a clear laminated glass roof and optional enclosure panels.", referenceImages:["/projects/elevated-glass-veranda.jpeg"], dimensions:["width","projection","height"], finishes:["Anthracite","Bronze","White"], options:["Integrated lighting","Sliding glass sides","Wall attached"], viewer:"glass" },
  { id:"guillotine", label:"Guillotine Glass", family:"glass", details:"Motorized vertically moving glass enclosure system with framed panels.", referenceImages:["/projects/elevated-guillotine-glass.jpeg"], dimensions:["width","height"], finishes:["Anthracite","Bronze","White"], options:["Motorized operation","Insulated glass","Clear glass"], viewer:"guillotine" },
  { id:"sliding_glass", label:"Sliding Glass — Concept Visualization", family:"glass", details:"Side-stacking sliding glass enclosure with slim aluminum framing. The catalog reference is a concept visualization, not a completed project photograph.", referenceImages:["/projects/elevated-sliding-glass.png"], dimensions:["width","height"], finishes:["Anthracite","Bronze","White"], options:["Clear glass","Locking hardware","Side stacking"], viewer:"sliding_glass" },
  { id:"umbrella", label:"Garden Umbrella", family:"umbrella", details:"Architectural square canopy umbrella with a central support and optional lighting.", referenceImages:["/projects/elevated-umbrella.jpeg"], dimensions:["width","length"], finishes:["Anthracite","Bronze","White"], options:["Integrated lighting","Motorized operation","Weighted base"], viewer:"umbrella" },
];

export function getProduct(id: string) {
  return products.find((product) => product.id === id);
}
