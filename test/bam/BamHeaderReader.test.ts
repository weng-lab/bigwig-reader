import Axios from "axios";
import { AxiosDataLoader } from "../../src/loader/AxiosDataLoader";
import { BamHeader, readBamHeaderData } from "../../src/bam/BamHeaderReader";

const testBamFilename = "test.bam";

describe("BamHeaderReader", () => {
    it("should read header", async () => {
        const headerLoader = new AxiosDataLoader(`http://localhost:8001/${testBamFilename}`, Axios.create());
        const header: BamHeader = await readBamHeaderData(headerLoader, 2000);
        expect(header.text.startsWith("@HD")).toBe(true);
        expect(header.chromToId).toHaveProperty("chr22");
        expect(Object.keys(header.chromToId)).toHaveLength(195);
    });
});