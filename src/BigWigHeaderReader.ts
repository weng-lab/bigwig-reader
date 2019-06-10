import { DataLoader } from "./DataLoader";
import { BinaryParser } from "./BinaryParser";
import { loadTwoBitHeaderData, SequenceRecord } from "./TwoBitHeaderReader";

const TWOBIT_MAGIC_LTH = 0x1A412743; // BigWig Magic High to Low
const TWOBIT_MAGIC_HTL = 0x4327411A; // BigWig Magic Low to High
const BIGWIG_MAGIC_LTH = 0x888FFC26; // BigWig Magic Low to High
const BIGWIG_MAGIC_HTL = 0x26FC8F88; // BigWig Magic High to Low
const BIGBED_MAGIC_LTH = 0x8789F2EB; // BigBed Magic Low to High
const BIGBED_MAGIC_HTL = 0xEBF28987; // BigBed Magic High to Low
const CHROM_TREE_MAGIC = 0x78CA8C91; // Chrom Tree Magic Number
const BBFILE_HEADER_SIZE = 64;

/**
 * Top level interface for all header data
 */
export interface HeaderData {
    fileType: FileType;
    littleEndian: boolean;
    common?: CommonHeader;
    zoomLevelHeaders?: Array<ZoomLevelHeader>;
    autosql?: string;
    totalSummary?: BWTotalSummary;
    chromTree?: ChromTree;
    sequences?: { [name: string]: number };
}

export enum FileType {
    BigWig = "BigWig", 
    BigBed = "BigBed",
    TwoBit = "TwoBit"
}

/**
 * Common Header for BigWig and BigBed files. Includes basic information. Located at the top of every file.
 */
export interface CommonHeader {
    bwVersion: number;
    nZoomLevels: number;
    chromTreeOffset: number;
    fullDataOffset: number;
    fullIndexOffset: number;
    fieldCount: number;
    definedFieldCount: number;
    autoSqlOffset: number;
    totalSummaryOffset: number;
    uncompressBuffSize: number;
    reserved: number;
}

export interface ZoomLevelHeader {
    index: number;
    reductionLevel: number;
    reserved: number;
    dataOffset: number;
    indexOffset: number;
}

export interface BWTotalSummary {
    basesCovered: number;
    minVal: number;
    maxVal: number;
    sumData: number;
    sumSquares: number;
}

/**
 * A flattened view of the data stored in a header's "chrom tree". The tree data takes the form of two dictionaries
 * for mapping chromosome names to indexes used by the file and visa versa.
 */
export interface ChromTree {
    magic: number;
    blockSize: number;
    keySize: number;
    valSize: number;
    itemCount: number;
    reserved: number;
    chromToId: { [chrom: string]: number };
    chromSize: { [chrom: string]: number };
    idToChrom: Array<string>;
}

/**
 * Loads all header data including common headers, zoom headers and chromosome tree.
 * 
 * @param dataLoader Provided class that deals with fetching data from the file via http, local file, ftp, etc...
 */
export async function loadHeaderData(dataLoader: DataLoader): Promise<HeaderData> {
    
    // Load common headers
    const headerData: ArrayBuffer = await dataLoader.load(0, BBFILE_HEADER_SIZE);

    // Try low-to-high
    let fileType: FileType|undefined = undefined;
    let littleEndian = true;
    let binaryParser = new BinaryParser(headerData, littleEndian);
    let magic = binaryParser.getUInt();
    if (BIGWIG_MAGIC_LTH === magic) {
        fileType = FileType.BigWig;
    } else if (BIGBED_MAGIC_LTH === magic) {
        fileType = FileType.BigBed;
    } else if (TWOBIT_MAGIC_LTH === magic) {
	return loadTwoBitHeaderData(dataLoader, littleEndian);
    } else {
        // Try high-to-low
        littleEndian = false;
        binaryParser = new BinaryParser(headerData, littleEndian);
        magic = binaryParser.getUInt();
        if (BIGWIG_MAGIC_HTL === magic) {
            fileType = FileType.BigWig;
        } else if (BIGBED_MAGIC_HTL === magic) {
            fileType = FileType.BigBed;
        } else if (TWOBIT_MAGIC_HTL === magic) {
	    return loadTwoBitHeaderData(dataLoader, littleEndian);
	}
    }

    // Don't bother with the rest if we haven't figured out the file type.
    if (undefined === fileType) {
        throw new Error("Unable to determine file type.");
    }

    const commonHeader: CommonHeader = {
        bwVersion: binaryParser.getUShort(),
        nZoomLevels: binaryParser.getUShort(),
        chromTreeOffset: binaryParser.getLong(),
        fullDataOffset: binaryParser.getLong(),
        fullIndexOffset: binaryParser.getLong(),
        fieldCount: binaryParser.getUShort(),
        definedFieldCount: binaryParser.getUShort(),
        autoSqlOffset: binaryParser.getLong(),
        totalSummaryOffset: binaryParser.getLong(),
        uncompressBuffSize: binaryParser.getInt(),
        reserved: binaryParser.getLong()
    }

    // Load Zoom Headers and Chr Tree
    const xdata: ArrayBuffer = await dataLoader.load(BBFILE_HEADER_SIZE, commonHeader.fullDataOffset - BBFILE_HEADER_SIZE + 5);

    const zoomLevelHeaders: Array<ZoomLevelHeader> = [];
    binaryParser = new BinaryParser(xdata);
    for (let i = 1; i <= commonHeader.nZoomLevels; i++) {
        const zoomNumber = commonHeader.nZoomLevels - i;
        const zoomLevelHeader: ZoomLevelHeader = {
            index: zoomNumber,
            reductionLevel: binaryParser.getInt(),
            reserved: binaryParser.getInt(),
            dataOffset: binaryParser.getLong(),
            indexOffset: binaryParser.getLong()
        }
        zoomLevelHeaders[zoomNumber] = zoomLevelHeader;
    }

    // Load autosql
    let autosql: string | undefined = undefined;
    if (commonHeader.autoSqlOffset > 0) {
        binaryParser.position = commonHeader.autoSqlOffset - BBFILE_HEADER_SIZE;
        autosql = binaryParser.getString();
    }

    // Load total summary
    let totalSummary: BWTotalSummary | undefined = undefined;
    if (commonHeader.totalSummaryOffset > 0) {
        binaryParser.position = commonHeader.totalSummaryOffset - BBFILE_HEADER_SIZE;
        totalSummary = {
            basesCovered: binaryParser.getLong(),
            minVal: binaryParser.getDouble(),
            maxVal: binaryParser.getDouble(),
            sumData: binaryParser.getDouble(),
            sumSquares: binaryParser.getDouble()
        }
    }

    // Load chrom data index
    let chromTree: ChromTree | undefined = undefined;
    if (commonHeader.chromTreeOffset > 0) {
        binaryParser.position = commonHeader.chromTreeOffset - BBFILE_HEADER_SIZE;
        const magic = binaryParser.getUInt();
        if (CHROM_TREE_MAGIC !== magic) {
            throw new Error("Chomosome ID B+ Tree not found.");
        }
        chromTree = {
            magic: magic,
            blockSize: binaryParser.getInt(),
            keySize: binaryParser.getInt(),
            valSize: binaryParser.getInt(),
            itemCount: binaryParser.getLong(),
            reserved: binaryParser.getLong(),
            chromToId: {},
            chromSize: {},
            idToChrom: []
        };
        buildChromTree(chromTree, binaryParser);
    }

    return {
        fileType: fileType,
        littleEndian: littleEndian,
        common: commonHeader,
        zoomLevelHeaders: zoomLevelHeaders,
        autosql: autosql,
        totalSummary: totalSummary,
        chromTree: chromTree
    }
}

/**
 * Recursively build our useful chrom-index mapping data from the header's chrom tree.
 * 
 * @param chromTree Object that stores the data to be built.
 * @param binaryParser binary data parser.
 * @param offset current file offset.
 */
function buildChromTree(chromTree: ChromTree, binaryParser: BinaryParser, offset?: number) {
    if (undefined !== offset) {
        binaryParser.position = offset;
    }

    const type: number = binaryParser.getByte();
    binaryParser.position++; // Skip reserved space
    const count: number = binaryParser.getUShort();

    // If the node is a leaf
    if (1 === type) {
        for (let i = 0; i < count; i++) {
            const key: string = binaryParser.getFixedLengthTrimmedString(chromTree.keySize);
            const chromId: number = binaryParser.getInt();
            const chromSize: number = binaryParser.getInt();

            chromTree.chromToId[key] = chromId;
            chromTree.idToChrom[chromId] = key;
            chromTree.chromSize[key] = chromSize;
        }
    } else {
        for (let i = 0; i < count; i++) {
            const key = binaryParser.getFixedLengthTrimmedString(chromTree.keySize);
            const childOffset: number = binaryParser.getLong();
            const bufferOffset: number = childOffset - BBFILE_HEADER_SIZE;
            const currOffset: number = binaryParser.position;
            buildChromTree(chromTree, binaryParser, bufferOffset);
            binaryParser.position = currOffset;
        }
    }
}
