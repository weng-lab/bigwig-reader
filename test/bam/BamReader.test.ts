import Axios from "axios";
import { AxiosDataLoader, BamReader, BamAlignment } from "../../src";

const testBamFilename = "test.bam";
const testBamIndexFilename = "test.bam.bai";

describe("BamReader", () => {
    it("should pull reads from a region of a bam", async () => {
        const bamLoader = new AxiosDataLoader(`http://localhost:8001/${testBamFilename}`, Axios.create());
        const bamIndexoader = new AxiosDataLoader(`http://localhost:8001/${testBamIndexFilename}`, Axios.create());
        const alignments: Array<BamAlignment> = await new BamReader(bamLoader, bamIndexoader)
                .read("chr22", 20_890_000, 20_910_000);
        expect(alignments).toHaveLength(300);
        expect(alignments[0]).toEqual({
            chr: "chr22", 
            start: 20890051, 
            flags: 16, 
            mappingQuality: 37, 
            strand: false, 
            templateLength: 0,
            seq: "TGTTCAGACCCTCTCGTTCTACGTCCTGTGCTGAGG", 
            phredQualities: [
                64, 64, 63, 63, 65, 64, 63, 64, 64, 63, 63, 64, 60, 63, 64, 64, 
                63, 57, 63, 64, 65, 65, 64, 65, 64, 65, 65, 65, 64, 62, 64, 65, 
                65, 65, 64, 88
            ],
            readName: "SOLEXA-1GA-2:3:13:303:913#0",
            cigarOps: [{ op: "M", opLen: 36, seqOffset: 0 }],
            lengthOnRef: 36
        });
    }, 30_000);
});