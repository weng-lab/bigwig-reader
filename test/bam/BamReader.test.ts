import Axios from "axios";
import { AxiosDataLoader } from "../../src/DataLoader";
import { BamReader, BamAlignment } from "../../src/bam/BamReader";

const testBamFilename = "test.bam";
const testBamIndexFilename = "test.bam.bai";

describe("BamReader", () => {
    it("should read a bam index", async () => {
        const bamLoader = new AxiosDataLoader(`http://localhost:8001/${testBamFilename}`, Axios.create());
        const bamIndexoader = new AxiosDataLoader(`http://localhost:8001/${testBamIndexFilename}`, Axios.create());
        const alignments: Array<BamAlignment> = await new BamReader(bamLoader, bamIndexoader)
                .read("chr22", 30_000_000, 30_005_000);
        expect(alignments).toHaveLength(100);
    });
});