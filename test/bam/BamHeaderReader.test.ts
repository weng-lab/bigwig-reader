import Axios from "axios";
import { AxiosDataLoader } from "../../src/loader/AxiosDataLoader";
import { BamHeader, readBamHeaderData } from "../../src/bam/BamHeaderReader";
import { BamIndexData, readBamIndex } from "../../src/bam/BamIndexReader";

const testBamIndexFilename = "test.bam.bai";
const testBamFilename = "test.bam";

describe("BamHeaderReader", () => {
    it("should read header", async () => {
        const indexLoader = new AxiosDataLoader(`http://localhost:8001/${testBamIndexFilename}`, Axios.create());
        const index: BamIndexData = await readBamIndex(indexLoader);
        const headerLoader = new AxiosDataLoader(`http://localhost:8001/${testBamFilename}`, Axios.create());
        const header: BamHeader = await readBamHeaderData(headerLoader, index.firstAlignmentBlock);
        expect(header.text.startsWith("@HD")).toBe(true);
        expect(header.chromToId).toHaveProperty("chr22");
        expect(Object.keys(header.chromToId)).toHaveLength(195);
    });
});