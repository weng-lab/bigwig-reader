import Axios from "axios";
import { AxiosDataLoader } from "../src/DataLoader";
import { loadHeaderData, loadSequenceRecord, loadSequence } from "../src/TwoBitReader";

const testTwoBitFilename = "test.2bit";

describe("TwoBitReader", () => {
    
    it("should get header", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
        const header = await loadHeaderData(loader);
        expect(header).toBeDefined;
	expect(Object.keys(header.sequences).length).toBe(2);
	expect(header.sequences.seq1).toBe(34);
	expect(header.sequences.seq2).toBe(100);
    });

    it("should get a sequence record for seq1", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
        const header = await loadHeaderData(loader);
	const seqrecord = await loadSequenceRecord(loader, header, "seq1");
    });

    it("should read some sequence from seq1", async () => {
	const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
	const header = await loadHeaderData(loader);
	const seqrecord = await loadSequenceRecord(loader, header, "seq1");
	console.log(await loadSequence(loader, header, seqrecord, 1, 10));
    });

});
