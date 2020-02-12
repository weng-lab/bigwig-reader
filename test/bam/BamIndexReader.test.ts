import Axios from "axios";
import { AxiosDataLoader } from "../../src";
import { BamIndexData, readBamIndex, streamRawBamIndex, parseRawIndexRefData, BamIndexRefData } from "../../src/bam/BamIndexReader";
import { appendBuffers, streamToArray } from "../testUtils";

const testBamFilename = "test.bam.bai";

describe("BamIndexReader", () => {
    it("should read a bam index", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBamFilename}`, Axios.create());
        const index: BamIndexData = await readBamIndex(loader);
        expect(index.refData.length).toBe(195);
        expect(index.refData[21].linearIndex.length).toBe(3102);
    });

    it("should stream raw index data for a single reference id", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBamFilename}`, Axios.create());
        const ref1RawDataStream = await streamRawBamIndex(loader, 21);
        const data: ArrayBuffer = appendBuffers(await streamToArray<ArrayBuffer>(ref1RawDataStream));
        const refIndexData: BamIndexRefData = parseRawIndexRefData(data);
        expect(refIndexData.linearIndex.length).toBe(3102);
    });
});