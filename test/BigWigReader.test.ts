import Axios from "axios";
import { AxiosDataLoader } from "../src/DataLoader";
import { BigWigReader } from "../src/BigWigReader";
import { HeaderData } from "../src/BigWigHeaderReader";

const testBWFilename = "testbw.bigwig";
const testBBFilename = "testbb.bigbed";

describe("BigWigReader", () => {
    it("should get header", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBWFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const header: HeaderData = await reader.getHeader();
        expect(header).toBeDefined;
        expect(header.common.bwVersion).toBe(4);
        expect(header.common.nZoomLevels).toBe(10);
    });

    it("should read unzoomed bigwig data", async() => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBWFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigWigData("chr14", 19_485_000, "chr14", 20_000_100);
        expect(data.length).toBe(83);
        expect(data[0]).toEqual({
            chr: "chr14", 
            start: 19_485_969, 
            end: 19_485_974, 
            value: 1
        });
        expect(data[10]).toEqual({
            chr: "chr14", 
            start: 19_486_029, 
            end: 19_486_030, 
            value: 1959
        });
    });

    it("should read more unzoomed bigwig data", async() => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBWFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigWigData("chr1", 0, "chrX", 0);
        expect(data.length).toBe(5074);
    });

    it("should read zoom data from bigwig file", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBWFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readZoomData("chr2", 0, "chr6", 1000, 9);
        expect(data.length).toBe(66);
        expect(data[0]).toEqual({ 
            chr: "chr2", 
            start: 29_432_593, 
            end: 29_432_633, 
            validCount: 40, 
            sumData: 28_328,
            sumSquares: 25_059_680,
            minVal: 1,
            maxVal: 885
        });
        expect(data[28]).toEqual({
            chr: "chr3", 
            start: 178_916_553, 
            end: 178_916_593, 
            validCount: 40,
            sumData: 23_544,
            sumSquares: 17_853_998,
            minVal: 2,
            maxVal: 759
        });
    });

    it("should read unzoomed bigbed data", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBBFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigBedData("chr21", 10_000_000, "chr21", 20_000_000);
        expect(data.length).toBe(46);
        expect(data[0].chr).toBe("chr21");
        expect(data[0].start).toBe(9_928_613);
        expect(data[0].end).toBe(10_012_791);
        expect(data[0].exons.length).toBe(22);
        expect(data[0].exons[0].start).toBe(9_928_613);
        expect(data[0].exons[0].end).toBe(9_928_911);
    });

    it("should read zoom data from bigbed file.", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBBFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readZoomData("chr21", 10_000_000, "chr21", 20_000_000, 3);
        expect(data.length).toBe(7);
        expect(data[0]).toEqual({ 
            chr: "chr21", 
            start: 9_928_613, 
            end: 101_638_05, 
            validCount: 162_274, 
            sumData: 606_012,
            sumSquares: 2_377_128,
            minVal: 1,
            maxVal: 5
        });
    });
    
});