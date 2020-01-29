import { DataLoader, BufferedDataLoader, FileFormatError, DataMissingError } from "../loader/DataLoader";
import { BinaryParser } from "../util/BinaryParser";
import { HeaderData, FileType } from "./BigWigHeaderReader";

const HEADER_BUFFER_SIZE = 32768;
const BUFFER_SIZE = 3_000_000;
const TWOBIT_HEADER_SIZE = 16;

function chararray(): (i: number) => string {
    const CHARMAPPING: string = "TCAG";
    const CHARARRAY: string[] = [];
    for (let i: number = 0; i <= 256; ++i)
        CHARARRAY.push(CHARMAPPING[i >> 6] + CHARMAPPING[(i >> 4) & 3] + CHARMAPPING[(i >> 2) & 3] + CHARMAPPING[i & 3]);
    return (i: number): string => CHARARRAY[i];
};

/**
 * Decodes a byte to a sequence of bases.
 *
 * @param twoBit: the two-bit encoded sequence of four bases to decode.
 */
const getBases: (twoBit: number) => string = chararray();

/**
 * Contains the full sequence data for one reference sequence within the file.
 *
 * @prop dnaSize the number of bases in the sequence
 * @prop nBlockCount the number of blocks of N's in the file
 * @prop nBlockStarts array of start positions for the N blocks
 * @prop nBlockSizes array of lengths for the N blocks
 * @prop maskBlockCount the number of masked (lower-case) sequence blocks
 * @prop maskBlockStarts array of start positions for the masked blocks
 * @prop maskBlockSizes array of sizes for the masked blocks
 * @prop sequence the full sequence of non-N bases
 */
export interface SequenceRecord {
    dnaSize: number;
    nBlockCount: number;
    nBlockStarts: number[];
    nBlockSizes: number[];
    maskBlockCount: number;
    maskBlockStarts: number[];
    maskBlockSizes: number[];
    reserved: number;
    offset: number;
};

/**
 * Loads header data, including the TwoBit header and sequence indexes, from a TwoBit file.
 * 
 * @param dataLoader Provided class that deals with fetching data from the file via http, local file, ftp, etc...
 */
export async function loadTwoBitHeaderData(dataLoaderR: DataLoader, littleEndian: boolean): Promise<HeaderData> {

    let dataLoader: BufferedDataLoader = new BufferedDataLoader(dataLoaderR, HEADER_BUFFER_SIZE);

    // Load common headers
    const headerData: ArrayBuffer = await dataLoader.load(0, TWOBIT_HEADER_SIZE);

    // Determine Endianness
    let binaryParser = new BinaryParser(headerData, littleEndian);
    let magic = binaryParser.getUInt();

    // read the rest of the header
    let version = binaryParser.getUInt();
    let sequenceCount = binaryParser.getUInt();
    let reserved = binaryParser.getUInt();
    if (version !== 0 || reserved !== 0)
        throw new FileFormatError("Unable to determine file type: invalid version or reserved header byte.")
    let header: HeaderData = {
        sequences: {},
        littleEndian: littleEndian,
        fileType: FileType.TwoBit
    };

    // Load sequence index
    let offset = TWOBIT_HEADER_SIZE;
    for (let i = 0; i < sequenceCount; ++i) {

        let xdata: ArrayBuffer = await dataLoader.load(offset, 4);
        let binaryParser = new BinaryParser(xdata, littleEndian);
        let size: number = binaryParser.getByte();
        offset += 1;

        xdata = await dataLoader.load(offset, size + 4);
        binaryParser = new BinaryParser(xdata, littleEndian);
        header.sequences![binaryParser.getString(size)] = binaryParser.getUInt();
        offset += size + 4;

    }

    return header;

}

/**
 * Loads a sequence record from a two-bit file.
 *
 * @param dataLoader class which handles reading ranges from the file, via HTTP, FTP, etc.
 * @param header the header data, read by loadHeaderData.
 * @param sequence the name of the chromosome or sequence from which to read.
 */
export async function loadSequenceRecord(dataLoaderR: DataLoader, header: HeaderData, sequence: string): Promise<SequenceRecord> {

    let dataLoader: BufferedDataLoader = new BufferedDataLoader(dataLoaderR, BUFFER_SIZE);

    if (header.sequences![sequence] === undefined)
        throw new DataMissingError(sequence)

    let data: ArrayBuffer = await dataLoader.load(header.sequences![sequence], 8);
    let binaryParser = new BinaryParser(data, header.littleEndian);
    let offset = header.sequences![sequence] + 8;

    let r: SequenceRecord = {
        dnaSize: binaryParser.getUInt(),
        nBlockCount: binaryParser.getUInt(),
        nBlockStarts: [],
        nBlockSizes: [],
        maskBlockCount: 0,
        maskBlockStarts: [],
        maskBlockSizes: [],
        reserved: 0,
        offset: 0
    };

    data = await dataLoader.load(offset, r.nBlockCount * 8 + 4);
    offset += r.nBlockCount * 8 + 4;
    binaryParser = new BinaryParser(data, header.littleEndian);
    for (let i = 0; i < r.nBlockCount; ++i)
        r.nBlockStarts.push(binaryParser.getUInt());
    for (let i = 0; i < r.nBlockCount; ++i)
        r.nBlockSizes.push(binaryParser.getUInt());
    r.maskBlockCount = binaryParser.getUInt();

    data = await dataLoader.load(offset, r.maskBlockCount * 8 + 4);
    offset += r.maskBlockCount * 8 + 4;
    binaryParser = new BinaryParser(data, header.littleEndian);
    for (let i = 0; i < r.maskBlockCount; ++i)
        r.maskBlockStarts.push(binaryParser.getUInt());
    for (let i = 0; i < r.maskBlockCount; ++i)
        r.maskBlockSizes.push(binaryParser.getUInt());
    r.reserved = binaryParser.getUInt();
    r.offset = offset;

    return r;

}

/**
 * Produces a sequence of repeating N's.
 *
 * @param i the number of N's.
 */
function rn(i: number): string {
    let retval: string = "";
    for (let ii: number = 0; ii < i; ++ii)
        retval += 'N';
    return retval;
}

/**
 * Loads sequence data from a two-bit file.
 *
 * @param dataLoader class which handles reading ranges from the file, via HTTP, FTP, etc.
 * @param header the header data, read by loadHeaderData.
 * @param sequence the sequence record for the chromosome to read from.
 * @param start the start position on the chromsome, 0-based and inclusive.
 * @param end the end position on the chromosome, 0-based and not inclusive.
 */
export async function loadSequence(dataLoader: DataLoader, header: HeaderData, 
        sequence: SequenceRecord, start: number, end: number): Promise<string> {

    let interruptingNBlocks = [], interruptingMaskBlocks = [];
    let csequence = "";
    start = start - 1 < 0 ? 0 : start - 1;

    /* find any interrupting blocks of N's */
    for (let i: number = 0; i < sequence.nBlockStarts.length; ++i) {
        if (sequence.nBlockStarts[i] > end) break;
        if (sequence.nBlockStarts[i] + sequence.nBlockSizes[i] < start) continue;
        interruptingNBlocks.push({
            start: sequence.nBlockStarts[i],
            size: sequence.nBlockSizes[i]
        });
    }

    /* find any interrupting lower-case mask blocks */
    for (let i: number = 0; i < sequence.maskBlockStarts.length; ++i) {
        if (sequence.nBlockStarts[i] > end) break;
        if (sequence.nBlockStarts[i] + sequence.nBlockSizes[i] < start) continue;
        interruptingMaskBlocks.push({
            start: sequence.maskBlockStarts[i],
            size: sequence.maskBlockSizes[i]
        });
    }

    let n: number = Math.ceil((end - start) / 4 + Math.ceil((start % 4) / 4));
    let data: ArrayBuffer = await dataLoader.load(Math.floor(start / 4) + sequence.offset, n);
    let binaryParser = new BinaryParser(data, header.littleEndian);
    for (let j: number = 0; j < n; ++j)
        csequence += getBases(binaryParser.getByte());
    csequence = csequence.substring(start % 4, start % 4 + end - start);

    /* fill in N's */
    interruptingNBlocks.forEach((block: { start: number, size: number }, i: number): void => {
        let blockEnd = block.start + block.size;
        if (i === 0 && block.start <= start)
            csequence = rn((blockEnd <= end ? blockEnd : end) - start) + csequence.substring(
                (blockEnd < end ? blockEnd : end) - start
            );
        else
            csequence = csequence.substring(0, block.start - start) + rn((blockEnd <= end ? blockEnd : end) - block.start) + csequence.substring(
                (blockEnd < end ? blockEnd : end) - start
            );
    });

    /* set lower case */
    interruptingMaskBlocks.forEach((block: { start: number, size: number }, i: number): void => {
        let blockEnd = block.start + block.size;
        if (i === 0 && block.start <= start)
            csequence = csequence.substring(0, (blockEnd <= end ? blockEnd : end) - start).toLowerCase() + csequence.substring(
                (blockEnd < end ? blockEnd : end) - start
            );
        else
            csequence = csequence.substring(0, block.start - start) + csequence.substring(block.start - start, (blockEnd <= end ? blockEnd : end) - start).toLowerCase() + csequence.substring(
                (blockEnd < end ? blockEnd : end) - start
            );
    });

    return csequence;
}
