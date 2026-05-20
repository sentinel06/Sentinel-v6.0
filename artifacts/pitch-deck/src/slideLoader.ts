import type { ComponentType } from "react";
import slidesManifest from "./data/slides-manifest.json";
import Slide01Title from "./pages/slides/Slide01Title";
import Slide02Problem from "./pages/slides/Slide02Problem";
import Slide03Solution from "./pages/slides/Slide03Solution";
import Slide04Product from "./pages/slides/Slide04Product";
import Slide05WhyNow from "./pages/slides/Slide05WhyNow";
import Slide06Market from "./pages/slides/Slide06Market";
import Slide07BusinessModel from "./pages/slides/Slide07BusinessModel";
import Slide08Competition from "./pages/slides/Slide08Competition";
import Slide09Team from "./pages/slides/Slide09Team";
import Slide10Ask from "./pages/slides/Slide10Ask";

const componentMap: Record<string, ComponentType> = {
  "src/pages/slides/Slide01Title.tsx": Slide01Title,
  "src/pages/slides/Slide02Problem.tsx": Slide02Problem,
  "src/pages/slides/Slide03Solution.tsx": Slide03Solution,
  "src/pages/slides/Slide04Product.tsx": Slide04Product,
  "src/pages/slides/Slide05WhyNow.tsx": Slide05WhyNow,
  "src/pages/slides/Slide06Market.tsx": Slide06Market,
  "src/pages/slides/Slide07BusinessModel.tsx": Slide07BusinessModel,
  "src/pages/slides/Slide08Competition.tsx": Slide08Competition,
  "src/pages/slides/Slide09Team.tsx": Slide09Team,
  "src/pages/slides/Slide10Ask.tsx": Slide10Ask,
};

export type Slide = {
  id: string;
  position: number;
  filepath: string;
  title: string;
  description: string;
  speakerNotes: string;
  Component: ComponentType;
};

const slides: Slide[] = slidesManifest.map((s) => ({
  ...s,
  Component: componentMap[s.filepath],
}));

export default slides;
