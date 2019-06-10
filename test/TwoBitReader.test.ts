import Axios from "axios";
import { AxiosDataLoader } from "../src/DataLoader";
import TwoBitReader from "../src/TwoBitReader";

const testTwoBitFilename = "test.2bit";

describe("TwoBitReader", () => {
    
    it("should get header", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
	const reader = new TwoBitReader(loader);
        const header = await reader.getHeader();
	expect(header.sequences).toEqual({
	    "seq1": 34,
	    "seq2": 100
	});
    });

    it("should get a sequence record for seq1", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
	const reader = new TwoBitReader(loader);
	const seqrecord = await reader.getSequenceRecord("seq1");
	expect(seqrecord).toEqual({
	    dnaSize: 165,
            nBlockCount: 1,
            nBlockStarts: [ 44 ],
            nBlockSizes: [ 40 ],
            maskBlockCount: 0,
            maskBlockStarts: [],
            maskBlockSizes: [],
            reserved: 0,
            offset: 58
	});
    });

    it("should read some sequence from seq1", async () => {
	const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
	const reader = new TwoBitReader(loader);
	expect(await reader.readTwoBitData("seq1", 1, 10)).toEqual("CTGATGCTA");
	expect(await reader.readTwoBitData("seq1", 44, 48)).toEqual("NNNN");
	expect(await reader.readTwoBitData("seq1", 43, 47)).toEqual("ANNN");
	expect(await reader.readTwoBitData("seq1", 43, 87)).toEqual("ANNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNCTA");
	expect(await reader.readTwoBitData("seq1", 83, 87)).toEqual("NCTA");
    });

    it("should read some sequence from seq2", async () => {
	const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
	const reader = new TwoBitReader(loader);
	expect(await reader.readTwoBitData("seq2", 0, 11)).toEqual("actgtgatcga");
	expect(await reader.readTwoBitData("seq2", 20, 22)).toEqual("tG");
	expect(await reader.readTwoBitData("seq2", 76, 78)).toEqual("Gg");
	expect(await reader.readTwoBitData("seq2", 105, 116)).toEqual("gtagccggcga");
    });

});
