import Axios from "axios";
import { exception } from "console";
import { AxiosDataLoader, BigWigReader, HeaderData, BigWigData } from "../src/";
import { parseBigBed } from "../src/bigwig/BigWigReader";
import { parseBigBedBroadPeak, parseBigBedIdrPeak, parseBigBedMethyl, parseBigBedNarrowPeak, parseBigBedTssPeak  } from "../src/bigwig/encodeBigBed";
import { streamToArray } from "./testUtils";

const testBWFilename = "testbw.bigwig";
const testBWFixedStepName = "test.fixedstep.bigwig";
const testBBFilename = "testbb.bigbed";
const testBBNarrowPeakFilename = "testbb-narrowpeak.bigBed";
const testBBBroadPeakFilename = "testbb-broadpeak.bigbed";
const testBBMethylFilename = "testbb-methyl.bigbed";
const testBBIdrPeakFilename = "testbb-idrpeak.bigbed";
const testBBTssFilename = "testbb-tss.bigbed";
const testLargeBWFilename = "testbw-large.bigwig";


describe("BigWigReader", () => {
    it("should get header", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBWFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const header: HeaderData = await reader.getHeader();
        expect(header).toBeDefined;
        expect(header.common!.bwVersion).toBe(4);
        expect(header.common!.nZoomLevels).toBe(10);
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

    it("should stream unzoomed bigwig data", async() => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBWFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const stream = await reader.streamBigWigData("chr14", 19_485_000, "chr14", 20_000_100);
        const data = await streamToArray<BigWigData>(stream);

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

    it("should read unzoomed bigbed data, without parseBigBed provided", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBBFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigBedData("chr21", 10_000_000, "chr21", 20_000_000);

        expect(data.length).toBe(46);
        expect(data[0].chr).toBe("chr21");
        expect(data[0].start).toBe(9_928_613);
        expect(data[0].end).toBe(10_012_791);
        expect(data[0].exons!.length).toBe(22);
        expect(data[0].exons![0].start).toBe(9_928_613);
        expect(data[0].exons![0].end).toBe(9_928_911);
    });

    it("should read unzoomed bigbed data", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBBFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigBedData("chr21", 10_000_000, "chr21", 20_000_000, parseBigBed);
        expect(data.length).toBe(46);
        expect(data[0].chr).toBe("chr21");
        expect(data[0].start).toBe(9_928_613);
        expect(data[0].end).toBe(10_012_791);
        expect(data[0].exons!.length).toBe(22);
        expect(data[0].exons![0].start).toBe(9_928_613);
        expect(data[0].exons![0].end).toBe(9_928_911);
    });


    it("should read unzoomed narrow peak bigbed data", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBBNarrowPeakFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigBedData("chr21", 33_037_487, "chr21", 33_047_461, parseBigBedNarrowPeak);
        expect(data.length).toBe(2);
        expect(data[0].chr).toBe("chr21");
        expect(data[0].start).toBe(33_039_438);
        expect(data[0].end).toBe(33_039_560);
        expect(data[0].name).toBe('chr21.1228');
        expect(data[0].score).toBe(577);
        expect(data[0].strand).toBe('.');
        expect(data[0].signalValue).toBe(0);
        expect(data[0].pValue).toBe(1);
        expect(data[0].qValue).toBe(-1);
        expect(data[0].peak).toBe(84);        
    });

    it("should read unzoomed broad peak bigbed data", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBBBroadPeakFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigBedData("chr1", 11_169_025, "chr1", 11_333_936, parseBigBedBroadPeak);
        expect(data.length).toBe(10);
        expect(data[0].chr).toBe("chr1");
        expect(data[0].start).toBe(11_176_299);
        expect(data[0].end).toBe(11_176_669);
        expect(data[0].name).toBe('id-773');
        expect(data[0].score).toBe(22);
        expect(data[0].strand).toBe('.');
        expect(data[0].signalValue).toBe(-1);
        expect(data[0].pValue).toBe(-1);
        expect(data[0].qValue).toBe(2);
    });

    it("should read unzoomed data methyl bigbed data", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBBMethylFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigBedData("chr3", 21_109_025, "chr3", 21_433_936, parseBigBedMethyl);
        expect(data.length).toBe(4);
        expect(data[0].chr).toBe("chr3");
        expect(data[0].start).toBe(21_267_378);
        expect(data[0].end).toBe(21_267_379);
        expect(data[0].name).toBe('AG09319_0__JS_');
        expect(data[0].score).toBe(1);
        expect(data[0].strand).toBe('+');
        expect(data[0].thickStart).toBe(21_267_378);
        expect(data[0].thickEnd).toBe(21_267_379);
        expect(data[0].reserved).toBe(255);
        expect(data[0].readCount).toBe(1);
        expect(data[0].percentMeth).toBe(100);
    });

    it("should read unzoomed data tss bigbed data", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBBTssFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigBedData("chr1", 1_109_025, "chr1", 1_433_936, parseBigBedTssPeak);
        expect(data.length).toBe(23);
        expect(data[0].chr).toBe("chr1");
        expect(data[0].start).toBe(1_167_323);
        expect(data[0].end).toBe(1_167_429);
        expect(data[0].name).toBe('TSS_chr1_minus_1115669_1176476_pk1');
        expect(data[0].score).toBe(1000);
        expect(data[0].strand).toBe('-');
        expect(data[0].count).toBe(928);
        expect(data[0].gene_id).toBe('chr1_minus_1115669_1176476');
        expect(data[0].tss_id).toBe('TSS_chr1_minus_1115669_1176476_pk1');
        expect(data[0].peak_cov).toBe('7.0,0.0,0.0,4.0,0.0,0.0,5.0,0.0,0.0,6.0,0.0,0.0,0.0,0.0,0.0,2.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0,18.0,0.0,0.0,25.0,2.0,0.0,8.0,18.0,0.0,26.0,31.0,45.0,100.0,102.0,314.0,6.0,1.0,1.0,97.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,3.0,0.0,57.0,2.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,2.0,0.0,2.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,2.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0,22.0,4.0,0.0,1.0,12.0');
    });

    it("should read unzoomed data idr peak bigbed data", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBBIdrPeakFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigBedData("chr1", 1_109_025, "chr1", 1_433_936, parseBigBedIdrPeak);
        expect(data.length).toBe(5);
        expect(data[0].chr).toBe("chr1");
        expect(data[0].start).toBe(1_116_078);
        expect(data[0].end).toBe(1_116_107);
        expect(data[0].name).toBe('.');
        expect(data[0].score).toBe(164);
        expect(data[0].strand).toBe('-');
        expect(data[0].localIDR).toBe(-0);
        expect(data[0].globalIDR).toBe(0.4)
        expect(data[0].rep1_chromStart).toBe(1_116_078);
        expect(data[0].rep1_chromEnd).toBe(1_116_107);
        expect(data[0].rep1_count).toBe(21);
        expect(data[0].rep2_chromStart).toBe(1_116_097);
        expect(data[0].rep2_chromEnd).toBe(10);
    });
    
    it("should read fixed step bigwig data", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testBWFixedStepName}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigWigData("chr3", 400_601, "chr3", 400_900);
        expect(data.length).toBe(3);
        expect(data[0]).toEqual({ 
            chr: "chr3",
            start: 400_600,
            end: 400_700, 
	    value: 11
        });
        expect(data[1]).toEqual({ 
            chr: "chr3",
            start: 400_700,
            end: 400_800, 
	    value: 22
        });
        expect(data[2]).toEqual({ 
            chr: "chr3",
            start: 400_800,
            end: 400_900, 
	    value: 33
        });
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
    
    it("should handle reading reading R+ trees with multiple layers.", async () => {
        const loader = new AxiosDataLoader(`http://localhost:8001/${testLargeBWFilename}`, Axios.create());
        const reader = new BigWigReader(loader);
        const data = await reader.readBigBedData("chr21", 10_000_000, "chr21", 11_000_000);
        expect(data.length).toBe(147);
    });

});
