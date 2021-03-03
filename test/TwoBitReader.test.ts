import Axios from "axios";
import { AxiosDataLoader, BigWigReader } from "../src/";
import { streamToArray } from "./testUtils";

const testTwoBitFilename = "test.2bit";

describe("TwoBitReader", () => {

	it("should get header", async () => {
		const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
		const reader = new BigWigReader(loader);
		const header = await reader.getHeader();
		expect(header.fileType).toEqual("TwoBit");
		expect(header.sequences).toEqual({
			"seq1": 34,
			"seq2": 100
		});
	});

	it("should get a sequence record for seq1", async () => {
		const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
		const reader = new BigWigReader(loader);
		const seqrecord = await reader.getSequenceRecord("seq1");
		expect(seqrecord).toEqual({
			dnaSize: 165,
			nBlockCount: 1,
			nBlockStarts: [44],
			nBlockSizes: [40],
			maskBlockCount: 0,
			maskBlockStarts: [],
			maskBlockSizes: [],
			reserved: 0,
			offset: 58
		});
	});

	it("should read some sequence from seq1", async () => {
		const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
		const reader = new BigWigReader(loader);
		expect(await reader.readTwoBitData("seq1", 2, 10)).toEqual("CTGATGCTA");
		expect(await reader.readTwoBitDataMatrix("seq1", 2, 5)).toEqual([[0,1,0,0],[0,0,0,1],[0,0,1,0],[1,0,0,0]]); 
		expect(await reader.readTwoBitData("seq1", 45, 48)).toEqual("NNNN");
		expect(await reader.readTwoBitData("seq1", 44, 47)).toEqual("ANNN");
		expect(await reader.readTwoBitData("seq1", 44, 87)).toEqual("ANNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNCTA");
		expect(await reader.readTwoBitData("seq1", 84, 87)).toEqual("NCTA");

		const x = await reader.readTwoBitData("seq1", 2, 124);
	});

	it("should read some sequence from seq2", async () => {
		const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
		const reader = new BigWigReader(loader);
		expect(await reader.readTwoBitData("seq2", 1, 11)).toEqual("actgtgatcga");
		expect(await reader.readTwoBitData("seq2", 21, 22)).toEqual("tG");
		expect(await reader.readTwoBitDataMatrix("seq2", 21, 22)).toEqual([[0,0,0,1],[0,0,1,0]]);
		expect(await reader.readTwoBitData("seq2", 77, 78)).toEqual("Gg");
		expect(await reader.readTwoBitData("seq2", 106, 116)).toEqual("gtagccggcga");
	});

	it("should stream sequence data from seq1", async () => {
		const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
		const reader = new BigWigReader(loader);
		const stream = await reader.streamTwoBitData("seq1", 2, 124, 32);
		const chunks: string[] = await streamToArray(stream);
		expect(chunks[0].substring(0,9)).toBe("CTGATGCTA");

		const chunkSizes = chunks.map((ch) => ch.length);
		expect(chunkSizes).toEqual([32, 32, 32, 27]);
	});

	it("should stream one hot encoded data from seq1", async () => {
		const loader = new AxiosDataLoader(`http://localhost:8001/${testTwoBitFilename}`, Axios.create());
		const reader = new BigWigReader(loader);
		const stream = await reader.streamTwoBitData("seq1", 2, 4, undefined, true);
		const chunks: string[] = await streamToArray(stream);
		
		expect(chunks[0]).toStrictEqual([[0,1,0,0],[0,0,0,1],[0,0,1,0]]);

		const chunkSizes = chunks.map((ch) => ch.length);
		expect(chunkSizes).toEqual([3]);
	});

});
