import axios from "axios";
import { AxiosDataLoader, BigWigReader } from "./dist/index.js";

const URl =
  "https://downloads.wenglab.org/DNAse_All_ENCODE_MAR20_2024_merged.bw";

const loader = new AxiosDataLoader(URl, axios.create());
const reader = new BigWigReader(loader);
const header = await reader.getHeader();
console.log(header.zoomLevelHeaders);

const START = 44905754;
const END = 50000000;
const PIXELS = 1400 * 3;
const range = END - START;
const bpPerPixel = range / PIXELS;

const bestZoom = header.zoomLevelHeaders
  ?.filter((z) => z.reductionLevel >= bpPerPixel)
  .sort((a, b) => a.reductionLevel - b.reductionLevel)[0];

const data = await reader.readZoomData(
  "chr12",
  START,
  "chr12",
  END,
  bestZoom?.index ?? 0
);
console.log(data.length);
