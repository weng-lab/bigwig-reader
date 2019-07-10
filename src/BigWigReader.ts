import { DataLoader, BufferedDataLoader } from "./DataLoader";
import { BinaryParser } from "./BinaryParser";
import { loadHeaderData, HeaderData, FileType } from "./BigWigHeaderReader";
import { loadSequenceRecord, loadSequence, SequenceRecord } from "./TwoBitHeaderReader";
import { inflate } from "pako"

export interface BigWigData {
    chr: string,
    start: number,
    end: number,
    value: number
}

export interface BigBedData {
    chr: string,
    start: number,
    end: number,
    name?: string,
    score?: number,
    strand?: string,
    cdStart?: number,
    cdEnd?: number,
    color?: string,
    exons?: Array<BigBedExon>
}

export interface BigBedExon {
    start: number,
    end: number
}

export interface BigZoomData {
    chr: string,
    start: number,
    end: number,
    validCount: number,
    minVal: number,
    maxVal: number,
    sumData: number,
    sumSquares: number
}

interface RPLeafNode {
    startChrom: number;
    startBase: number;
    endChrom: number;
    endBase: number;
    dataOffset: number;
    dataSize: number;
}

const IDX_MAGIC = 0x2468ACE0;
const RPTREE_HEADER_SIZE = 48;
const RPTREE_NODE_LEAF_ITEM_SIZE = 32;
const RPTREE_NODE_CHILD_ITEM_SIZE = 24;
const DEFAULT_BUFFER_SIZE = 512000;

/**
 * Main class for dealing with reading BigWig and BigBed files.
 */
export class BigWigReader {

    private cachedHeader?: HeaderData;
    private cachedSequenceRecords: { [name: string]: SequenceRecord } = {};

    /**
     * @param dataLoader Provided class that deals with fetching data from the file via http, local file, ftp, etc...
     * @param bufferSize Size of the buffer used for fetching data. Used to optimistically read more data than is 
     *      needed for each read of the tree that stores data to avoid round trips. The trade-off is potentially reading 
     *      more data than you need to vs making more round trips.
     */
    constructor(private dataLoader: DataLoader, private bufferSize: number = DEFAULT_BUFFER_SIZE) { }

    /**
     * Gets the type of the underlying file.
     */
    async fileType(): Promise<FileType> {
	let header: HeaderData = await this.getHeader();
	return header.fileType;
    }
    
    /**
     * Method for getting all header data for dataLoader's file. Data is loaded on demand and cached for subsequent requests.
     */
    async getHeader(): Promise<HeaderData> {
        if (!this.cachedHeader) {
            this.cachedHeader = await loadHeaderData(this.dataLoader);
        }
        return this.cachedHeader;
    }

    /**
     * Method for getting a sequence record from a 2bit sequence file. This method is not valid for bigWig or bigBed files.
     *
     * @param chrom the name of the chromosome or other sequence to retrieve.
     */
    async getSequenceRecord(chrom: string): Promise<SequenceRecord> {
	let header: HeaderData = await this.getHeader();
	if (header.fileType !== FileType.TwoBit) throw new Error("getSequenceRecord is not valid on " + header.fileType + " files.");
	if (!this.cachedSequenceRecords[chrom])
	    this.cachedSequenceRecords[chrom] = await loadSequenceRecord(this.dataLoader, header, chrom);
	return this.cachedSequenceRecords[chrom];
    }
    
    /**
     * Method for reading unzoomed wig data from BigWig files.
     * 
     * @param startChrom Starting chromosome
     * @param startBase Starting base pair
     * @param endChrom Ending chromose
     * @param endBase Ending base pair
     * @param zoomLevelIndex The ZoomLevelHeader.index from the zoom level you want to read from. 
     */
    async readBigWigData(startChrom: string, startBase: number, endChrom: string, endBase: number): Promise<Array<BigWigData>> {
        return this.readData<BigWigData>(startChrom, startBase, endChrom, endBase, (await this.getHeader()).common!.fullIndexOffset, decodeWigData);
    }

    /**
     * Method for reading unzoomed bed data from BigBed files.
     * 
     * @param startChrom Starting chromosome
     * @param startBase Starting base pair
     * @param endChrom Ending chromose
     * @param endBase Ending base pair
     */
    async readBigBedData(startChrom: string, startBase: number, endChrom: string, endBase: number): Promise<Array<BigBedData>> {
        return this.readData<BigBedData>(startChrom, startBase, endChrom, endBase, (await this.getHeader()).common!.fullIndexOffset, decodeBedData);
    }

    /**
     * Method for reading Two Bit sequence data from TwoBit files.
     *
     * @param chrom the chromosome from which to read.
     * @param startBase the starting base.
     * @param endBase the ending base.
     */
    async readTwoBitData(chrom: string, startBase: number, endBase: number): Promise<string> {
	let sequence: SequenceRecord = await this.getSequenceRecord(chrom);
        return loadSequence(this.dataLoader, this.cachedHeader!, sequence, startBase, endBase);
    }

    /**
     * Method for reading zoomed data from BigWig and BigBed files.
     * 
     * @param startChrom Starting chromosome
     * @param startBase Starting base pair
     * @param endChrom Ending chromose
     * @param endBase Ending base pair
     * @param zoomLevelIndex index of the zoom level. You can call getHeader() for a list of these values under HeaderData.zoomLevelHeaders.
     */
    async readZoomData(startChrom: string, startBase: number, endChrom: string, endBase: number, zoomLevelIndex: number): Promise<Array<BigZoomData>> {
        const header = await this.getHeader();
        if (undefined == header.zoomLevelHeaders || !(zoomLevelIndex in header.zoomLevelHeaders)) {
            throw Error("Given zoomLevelIndex not found in zoom level headers.");
        }
        const treeOffset = header.zoomLevelHeaders[zoomLevelIndex].indexOffset;
        return this.readData<BigZoomData>(startChrom, startBase, endChrom, endBase, treeOffset, decodeZoomData);
    }

    /**
     * Method containing all the shared functionality for reading BigWig and BigBed files.
     * 
     * @param startChrom Starting chromosome
     * @param startBase Starting base pair
     * @param endChrom Ending chromosome
     * @param endBase Ending base pair
     * @param treeOffset Location of the R+ tree that stores the data we're interested.
     * @param decodeFunction 
     */
    private async readData<T>(startChrom: string, startBase: number, endChrom: string, endBase: number, treeOffset: number,
			      decodeFunction: DecodeFunction<T>): Promise<Array<T>> {
        const header = await this.getHeader();
        if (undefined == header.chromTree) {
            throw Error("No chromosome tree found in file header.");
        }
        const startChromIndex: number = header.chromTree.chromToId[startChrom];
        const endChromIndex: number = header.chromTree.chromToId[endChrom];
        if (undefined == startChromIndex) {
            throw Error(`Given chromosome ${startChrom} not found in file header chromosome tree.`);
        }
        if (undefined == endChromIndex) {
            throw Error(`Given chromosome ${endChrom} not found in file header chromosome tree.`);
        }

        // Load all leaf nodes within given chr / base bounds for the R+ tree used for actually storing the data.
        const bufferedLoader = new BufferedDataLoader(this.dataLoader, DEFAULT_BUFFER_SIZE);
        const magic = new BinaryParser(await bufferedLoader.load(treeOffset, RPTREE_HEADER_SIZE)).getUInt();
        if (IDX_MAGIC !== magic) {
            throw new Error(`R+ tree not found at offset ${treeOffset}`);
        }
        const rootNodeOffset = treeOffset + RPTREE_HEADER_SIZE;
        const leafNodes: Array<RPLeafNode> = await loadLeafNodesForRPNode(bufferedLoader, header.littleEndian, rootNodeOffset, 
            startChromIndex, startBase, endChromIndex, endBase);

        // Iterate through filtered leaf nodes, load the data, and decode it
        const decodedData: Array<T> = [];
        for (const leafNode of leafNodes) {
            let leafData = new Uint8Array(await bufferedLoader.load(leafNode.dataOffset, leafNode.dataSize));
            if (header.common!.uncompressBuffSize > 0) {
                leafData = inflate(leafData);
            }
            let leafDecodedData = decodeFunction(leafData.buffer as ArrayBuffer, startChromIndex, startBase, endChromIndex, 
                endBase, header.chromTree.idToChrom);
            decodedData.push(...leafDecodedData);
        }
        return decodedData;
    }

}

/**
 * Recursively load a list of R+ tree leaf nodes for the given node (by file offset) within given chr / base bounds.
 * 
 * @param bufferedLoader Buffered data loader used to load the node data.
 * @param rpNodeOffset Offset for the start of the R+ tree node
 * @param startChromIndex starting chromosome index used for filtering
 * @param startBase starting base used for filtering
 * @param endChromIndex ending chromosome index used for filtering
 * @param startBase ending base used for filtering
 * @returns List of simple representations of leaf nodes for the given node offset.
 */
async function loadLeafNodesForRPNode(bufferedLoader: BufferedDataLoader, littleEndian: boolean, rpNodeOffset: number, startChromIndex: number,
    startBase: number, endChromIndex: number, endBase: number): Promise<Array<RPLeafNode>> {
    const nodeHeaderData: ArrayBuffer = await bufferedLoader.load(rpNodeOffset, 4);
    const nodeHeaderParser = new BinaryParser(nodeHeaderData, littleEndian);
    const isLeaf = 1 === nodeHeaderParser.getByte();
    nodeHeaderParser.position++; // Skip reserved space
    const count = nodeHeaderParser.getUShort();

    const nodeDataOffset = rpNodeOffset + 4;
    const bytesRequired = count * (isLeaf ? RPTREE_NODE_LEAF_ITEM_SIZE : RPTREE_NODE_CHILD_ITEM_SIZE);
    const nodeData: ArrayBuffer = await bufferedLoader.load(nodeDataOffset, bytesRequired);

    let leafNodes: Array<RPLeafNode> = [];
    const nodeDataParser = new BinaryParser(nodeData, littleEndian);
    for (let i = 0; i < count; i++) {
        const nodeStartChr = nodeDataParser.getInt();
        const nodeStartBase = nodeDataParser.getInt();
        const nodeEndChr = nodeDataParser.getInt();
        const nodeEndBase = nodeDataParser.getInt();
        // If this node overlaps with the chr / base range provided
        const overlaps: boolean = ((endChromIndex > nodeStartChr) || (endChromIndex == nodeStartChr && endBase >= nodeStartBase)) &&
            ((startChromIndex < nodeEndChr) || (startChromIndex == nodeEndChr && startBase <= nodeEndBase));
        if (isLeaf) {
            const leafNode: RPLeafNode = {
                startChrom: nodeStartChr,
                startBase: nodeStartBase,
                endChrom: nodeEndChr,
                endBase: nodeEndBase,
                dataOffset: nodeDataParser.getLong(),
                dataSize: nodeDataParser.getLong()
            };
            if (overlaps) {
                leafNodes.push(leafNode);
            }
        } else {
            const childOffset = nodeDataParser.getLong();
            if (overlaps) {
                leafNodes.push(... await loadLeafNodesForRPNode(bufferedLoader, littleEndian, childOffset, startChromIndex, startBase, endChromIndex, endBase));
            }
        }
    }

    return leafNodes;
}

type DecodeFunction<T> = (data: ArrayBuffer, startChromIndex: number, startBase: number, endChromIndex: number,
    endBase: number, chromDict: Array<string>) => Array<T>;

/**
 * Extract useful data from sections of raw big binary bed data
 * 
 * @param data Raw bed data
 * @param filterStartChromIndex starting chromosome index used for filtering
 * @param filterStartBase starting base used for filtering
 * @param filterEndChromIndex ending chromosome index used for filtering
 * @param filterEndBase ending base used for filtering
 * @param chromDict dictionary of indices used by the file to chromosome names, conveniently stored as an array.
 */
function decodeBedData(data: ArrayBuffer, filterStartChromIndex: number, filterStartBase: number, filterEndChromIndex: number,
        filterEndBase: number, chromDict: Array<string>): Array<BigBedData> {
    const decodedData: Array<BigBedData> = [];
    const binaryParser = new BinaryParser(data);

    const minSize = 3 * 4 + 1;    // Minimum # of bytes required for a bed record
    while (binaryParser.remLength() >= minSize) {
        const chromIndex = binaryParser.getInt();
        const chrom = chromDict[chromIndex];
        const startBase = binaryParser.getInt();
        const endBase = binaryParser.getInt();
        const rest = binaryParser.getString();

        if (chromIndex < filterStartChromIndex || (chromIndex === filterStartChromIndex && endBase < filterStartBase)) {
            continue;
        } else if (chromIndex > filterEndChromIndex || (chromIndex === filterEndChromIndex && startBase >= filterEndBase)) {
            break;
        }

        const entry: BigBedData = {
            chr: chrom,
            start: startBase,
            end: endBase
        }

        let tokens = rest.split("\t");
        if (tokens.length > 0) {
            entry.name = tokens[0];
        }
        if (tokens.length > 1) {
            entry.score = parseFloat(tokens[1]);
        }
        if (tokens.length > 2) {
            entry.strand = tokens[2];
        }
        if (tokens.length > 3) {
            entry.cdStart = parseInt(tokens[3]);
        }
        if (tokens.length > 4) {
            entry.cdEnd = parseInt(tokens[4]);
        }
        if (tokens.length > 5 && tokens[5] !== "." && tokens[5] !== "0") {
            let color: string;
            if (tokens[5].includes(",")) {
                color = tokens[5].startsWith("rgb") ? tokens[5] : "rgb(" + tokens[5] + ")";
            } else {
                color = tokens[5];
            }
            entry.color = color;
        }
        if (tokens.length > 8) {
            const exonCount = parseInt(tokens[6]);
            const exonSizes = tokens[7].split(',');
            const exonStarts = tokens[8].split(',');
            const exons: Array<BigBedExon> = [];

            for (var i = 0; i < exonCount; i++) {
                const eStart = startBase + parseInt(exonStarts[i]);
                const eEnd = eStart + parseInt(exonSizes[i]);
                exons.push({ start: eStart, end: eEnd });
            }

            entry.exons = exons;
        }
        decodedData.push(entry);
    }

    return decodedData;
}

/**
 * Extract useful data from sections of raw big binary unzoomed wig data
 * 
 * @param data Raw unzoomed wig data
 * @param filterStartChromIndex starting chromosome index used for filtering
 * @param filterStartBase starting base used for filtering
 * @param filterEndChromIndex ending chromosome index used for filtering
 * @param filterEndBase ending base used for filtering
 * @param chromDict dictionary of indices used by the file to chromosome names, conveniently stored as an array.
 */
function decodeWigData(data: ArrayBuffer, filterStartChromIndex: number, filterStartBase: number, filterEndChromIndex: number,
        filterEndBase: number, chromDict: Array<string>): Array<BigWigData> {
    const decodedData: Array<BigWigData> = [];
    const binaryParser = new BinaryParser(data);

    const chromIndex = binaryParser.getInt();
    const chrom = chromDict[chromIndex];
    let startBase = binaryParser.getInt();
    let endBase = binaryParser.getInt();
    const itemStep = binaryParser.getInt();
    const itemSpan = binaryParser.getInt();
    const type = binaryParser.getByte();
    const reserved = binaryParser.getByte();
    let itemCount = binaryParser.getUShort();

    if (chromIndex < filterStartChromIndex || chromIndex > filterEndChromIndex) {
        return decodedData;
    }

    while (itemCount-- > 0) {
        let value: number;
        if (1 === type) {
            // Data is stored in Bed Graph format
            startBase = binaryParser.getInt();
            endBase = binaryParser.getInt();
            value = binaryParser.getFloat();
        } else if (2 === type) {
            // Data is stored in Variable Step format
            startBase = binaryParser.getInt();
            value = binaryParser.getFloat();
            endBase = startBase + itemSpan;
        } else {
            // Data is stored in Fixed Step format.
            value = binaryParser.getFloat();
            endBase = startBase + itemSpan;
        }

	if (chromIndex > filterEndChromIndex || (chromIndex === filterEndChromIndex && startBase >= filterEndBase)) {
	    break; // past the end of the range; exit
	} else if (!(chromIndex < filterStartChromIndex || (chromIndex === filterStartChromIndex && endBase < filterStartBase))) {
	    decodedData.push({
		chr: chrom,
		start: startBase,
		end: endBase,
		value: value
            }); // this is within the range (i.e. not before the first requested base); add this datapoint
        }

	if (1 !== type && 2 !== type) {
	    // data is stored in Fixed Step format
	    // only increment the start base once the last entry has been pushed
	    startBase += itemStep;
	}
    }
    return decodedData;
}

/**
 * Extract useful data from sections of raw big binary zoom data
 * 
 * @param data Raw zoomed wig data
 * @param filterStartChromIndex starting chromosome index used for filtering
 * @param filterStartBase starting base used for filtering
 * @param filterEndChromIndex ending chromosome index used for filtering
 * @param filterEndBase ending base used for filtering
 * @param chromDict dictionary of indices used by the file to chromosome names, conveniently stored as an array.
 */
function decodeZoomData(data: ArrayBuffer, filterStartChromIndex: number, filterStartBase: number, filterEndChromIndex: number,
        filterEndBase: number, chromDict: Array<string>): Array<BigZoomData> {
    const decodedData: Array<BigZoomData> = [];
    const binaryParser = new BinaryParser(data);

    const minSize = 8 * 4;   // Minimum # of bytes required for a zoom record
    while (binaryParser.remLength() > minSize) {
        const chromIndex = binaryParser.getInt();
        const decodedZoomData: BigZoomData = {
            chr: chromDict[chromIndex],
            start: binaryParser.getInt(),
            end: binaryParser.getInt(),
            validCount: binaryParser.getInt(),
            minVal: binaryParser.getFloat(),
            maxVal: binaryParser.getFloat(),
            sumData: binaryParser.getFloat(),
            sumSquares: binaryParser.getFloat()
        };

        if (chromIndex < filterStartChromIndex || (chromIndex === filterStartChromIndex && decodedZoomData.end < filterStartBase)) {
            continue;
        } else if (chromIndex > filterEndChromIndex || (chromIndex === filterEndChromIndex && decodedZoomData.start >= filterEndBase)) {
            break;
        }
        decodedData.push(decodedZoomData);
    }
    return decodedData;
}
