import { DataLoader } from "./DataLoader";
import { BinaryParser } from "./BinaryParser";

const TWOBIT_MAGIC_HTL = 0x1A412743; // BigWig Magic High to Low
const TWOBIT_MAGIC_LTH = 0x4327411A; // BigWig Magic Low to High
const TWOBIT_HEADER_SIZE = 16;

const CHARMAPPING: string = "TCAG";
const CHARARRAY: string[] = [];
for (let i: number = 0; i <= 256; ++i)
    CHARARRAY.push(CHARMAPPING[i >> 6] + CHARMAPPING[(i >> 4) & 3] + CHARMAPPING[(i >> 2) & 3] + CHARMAPPING[i & 3]);

/**
 * Represents the header of a two-bit file.
 *
 * @prop sequences map of sequence names to offsets within the Two-Bit file.
 */
export interface HeaderData {
    littleEndian: boolean;
    sequences: { [name: string]: number };
};

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
export async function loadHeaderData(dataLoader: DataLoader): Promise<HeaderData> {
    
    // Load common headers
    const headerData: ArrayBuffer = await dataLoader.load(0, TWOBIT_HEADER_SIZE);

    // Determine Endianness
    let littleEndian = true;
    let binaryParser = new BinaryParser(headerData, littleEndian);
    let magic = binaryParser.getUInt();
    if (TWOBIT_MAGIC_LTH === magic) {
        littleEndian = false;
        binaryParser = new BinaryParser(headerData, littleEndian);
        magic = binaryParser.getUInt();
        if (TWOBIT_MAGIC_HTL === magic)
	    throw new Error("Unable to determine file type: invalid magic number.");
    }

    // read the rest of the header
    let version = binaryParser.getUInt();
    let sequenceCount = binaryParser.getUInt();
    let reserved = binaryParser.getUInt();
    if (version !== 0 || reserved !== 0)
	throw new Error("Unable to determine file type: invalid version or reserved header byte.")
    let header: HeaderData = {
	sequences: {},
	littleEndian: littleEndian
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
	header.sequences[binaryParser.getString(size)] = binaryParser.getUInt();
	offset += size + 4;
	
    }

    return header;
    
}

export async function loadSequenceRecord(dataLoader: DataLoader, header: HeaderData, sequence: string): Promise<SequenceRecord> {

    if (header.sequences[sequence] === undefined)
	throw new Error("sequence " + sequence + " is not present in the file.")
    
    let data: ArrayBuffer = await dataLoader.load(header.sequences[sequence], 8);
    let binaryParser = new BinaryParser(data, header.littleEndian);
    let offset = header.sequences[sequence] + 8;

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

export async function loadSequence(dataLoader: DataLoader, header: HeaderData, sequence: SequenceRecord, start: number, end: number): Promise<string> {

    let interruptingNBlocks = [], interruptingMaskBlocks = [];
    let dataOffset: number = Math.floor(sequence.offset + start / 4);
    let csequence = "";

    /* find any interrupting blocks of N's */
    for (let i: number = 0; i < sequence.nBlockStarts.length; ++i) {
	if (sequence.nBlockStarts[i] > end) break;
	if (sequence.nBlockStarts[i] + sequence.nBlockSizes[i] < start) {
	    dataOffset -= sequence.nBlockSizes[i] / 4;
	    continue;
	}
	interruptingNBlocks.push({
	    start: sequence.nBlockStarts[i],
	    size: sequence.nBlockSizes[i]
	});
    }

    /* find any interrupting lower-case mask blocks */
    for (let i: number = 0; i < sequence.nBlockStarts.length; ++i) {
	if (sequence.nBlockStarts[i] > end) break;
	if (sequence.nBlockStarts[i] + sequence.nBlockSizes[i] < start) continue;
	interruptingMaskBlocks.push({
	    start: sequence.maskBlockStarts[i],
	    size: sequence.maskBlockSizes[i]
	});
    }
    
    /* if it starts with N's, fill those in first */
    if (interruptingNBlocks.length > 0 && interruptingNBlocks[0].start < start)
	for (let i: number = start; i < interruptingNBlocks[0].start + interruptingNBlocks[i].size; ++i)
	    csequence += 'N';

    /* read the sequences between any interrupting N blocks */
    for (let i: number = (interruptingNBlocks.length > 0 && interruptingNBlocks[0].start < start ? 1 : 0); i < interruptingNBlocks.length; ++i) {

	let lastEnd = i === 0 ? start : interruptingNBlocks[i - 1].start + interruptingNBlocks[i - 1].size;
	let data: ArrayBuffer = await dataLoader.load(dataOffset, (interruptingNBlocks[i].start - lastEnd) / 4);
	dataOffset += (interruptingNBlocks[i].start - lastEnd) / 4;
	
	let binaryParser = new BinaryParser(data, header.littleEndian);
	for (let j: number = 0; j < (interruptingNBlocks[i].start - lastEnd) / 4; ++j)
	    csequence += CHARARRAY[binaryParser.getByte()];
	for (let j: number = 0; j < interruptingNBlocks[i].size && j < end; ++j)
	    csequence += 'N';
	
    }

    /* if it ends with non-N's, read those in last */
    if (interruptingNBlocks.length === 0 || end > interruptingNBlocks[-1].start + interruptingNBlocks[-1].size) {
	let lastEnd = interruptingNBlocks.length === 0 ? start : interruptingNBlocks[-1].start + interruptingNBlocks[-1].size;
	let data: ArrayBuffer = await dataLoader.load(dataOffset, Math.ceil((end - lastEnd) / 4));
	let binaryParser = new BinaryParser(data, header.littleEndian);
	for (let j: number = 0; j < (end - lastEnd) / 4; ++j)
	    csequence += CHARARRAY[binaryParser.getByte()];
    }

    return csequence;
    
}
