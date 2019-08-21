import Axios from "axios";
import { AxiosDataLoader } from "../../src";
import { BamIndexData, readBamIndex } from "../../src/bam/BamIndexReader";

const testBamFilename = "test.bam.bai";

describe("BamIndexReader", () => {
    it("should read a bam index", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBamFilename}`, Axios.create());
        const index: BamIndexData = await readBamIndex(loader);
        expect(index.firstAlignmentBlock).toBe(11998032);
        expect(index.refData.length).toBe(195);
    });
});