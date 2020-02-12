import { DataLoader, BufferedDataLoader } from "../loader/DataLoader";
import { BinaryParser } from "../util/BinaryParser";
import { Readable } from "stream";


// Type Pseudonym for raw compressed virtual offset data.
// It will take up half the memory in this form.
export type RawVirtualOffset = Uint8Array;

export interface VirtualOffset {
    // Offset of the compressed data block
    blockPosition: number,
    // Offset into the uncompressed data
    dataPosition: number
}

export interface RawChunk {
    start: RawVirtualOffset,
    end: RawVirtualOffset
}

export interface Chunk {
    start: VirtualOffset,
    end: VirtualOffset
}

export interface BinIndex {
    [binNumber: string]: Array<RawChunk>
}

export interface BamIndexRefData {
    binIndex: BinIndex, 
    linearIndex: Array<RawVirtualOffset>
}

// Top Level Representation of Parsed Index
export interface BamIndexData {
    // array of index data per reference id, where reference id is array index.
    refData: Array<BamIndexRefData>
}

const BAI_MAGIC = 21578050;
const PSEUDO_BIN_MAGIC = 37450;

/**
 * Given index data and a range return all possible regions matching alignments could be in.
 * 
 * @param bamIndexRefData 
 * @param refId 
 * @param start 
 * @param end 
 */
export function blocksForRange(indexData: BamIndexRefData, start: number, end: number): Array<Chunk> {
    const overlappingBins: Array<number> = reg2bins(start, end);
    const binIndex: BinIndex = indexData.binIndex;
    const linearIndex: Array<RawVirtualOffset> = indexData.linearIndex;
    
    // Get all chunks for overlapping bins.
    let allChunks: Array<Chunk> = [];
    for (let bin in binIndex) {
        if (!overlappingBins.includes(Number(bin))) continue;
        const inflatedChunks = binIndex[bin].map((rawChunk) => inflateChunk(rawChunk));
        allChunks = allChunks.concat(inflatedChunks);
    }

    // Use the linear index to find minimum file position of chunks that could 
    // contain alignments in the region.
    let lowest: VirtualOffset | undefined = undefined;
    const minLin = Math.min(start >> 14, linearIndex.length - 1);
    const maxLin = Math.max(end >> 14, linearIndex.length - 1);
    for (let i = minLin; i <= maxLin; i++) {
        let offset: VirtualOffset = inflateVirtualOffset(linearIndex[i]);
        if (offset === undefined) continue;
        if (lowest === undefined || isVOLessThan(offset, lowest)) {
            lowest = offset;
        }
    }

    return optimizeChunks(allChunks, lowest);
}

function isVOLessThan(first: VirtualOffset, second: VirtualOffset): boolean {
    return first.blockPosition < second.blockPosition ||
            (first.blockPosition === second.blockPosition && first.dataPosition < second.dataPosition);
}

function optimizeChunks(chunks: Array<Chunk>, lowest?: VirtualOffset): Array<Chunk> {
    if (chunks.length === 0) return []
    let mergedChunks: Array<Chunk> = [];

    chunks.sort(function (c0, c1) {
        let dif = c0.start.blockPosition - c1.start.blockPosition;
        if (dif != 0) {
            return dif;
        } else {
            return c0.start.dataPosition - c1.start.dataPosition;
        }
    });

    let currentMergedChunk: Chunk | undefined = undefined;
    for (let chunk of chunks) {
        if (lowest !== undefined && isVOLessThan(chunk.end, lowest)){
            continue;
        }
        if (currentMergedChunk === undefined) {
            currentMergedChunk = chunk;
            mergedChunks.push(currentMergedChunk);
        }

        // Merge chunks that are withing 65k of each other
        if ((chunk.start.blockPosition - currentMergedChunk.end.blockPosition) < 65000) {
            if (isVOLessThan(currentMergedChunk.end, chunk.end)) {
                currentMergedChunk.end = chunk.end;
            }
        } else {
            currentMergedChunk = chunk;
            mergedChunks.push(currentMergedChunk);
        }
    }

    return mergedChunks;
}

/**
 * Read the bam index for the given loader.
 * 
 * @param indexDataLoader loader for bam index file.
 */
export async function readBamIndex(indexDataLoader: DataLoader): Promise<BamIndexData> {
    return readBamIndexData(indexDataLoader);
}

/**
 * Read the bam index for the given loader, only returning data for a single reference ID (found in header).
 * 
 * @param indexDataLoader loader for bam index file.
 * @param refId The reference id to provide data for.
 */
export async function readBamIndexRef(indexDataLoader: DataLoader, refId: number): Promise<BamIndexRefData> {
    return (await readBamIndexData(indexDataLoader, refId)).refData[refId];
}

async function readBamIndexData(indexDataLoader: DataLoader, refId?: number): Promise<BamIndexData> {
    const indexData: ArrayBuffer = await indexDataLoader.load(0);
    const parser = new BinaryParser(indexData);
    const magic = parser.getInt();
    if (magic !== BAI_MAGIC) {
        throw new Error('Not a BAI file');
    }

    const refData: Array<BamIndexRefData> = [];

    // Number of reference sequences
    const numRefs = parser.getInt();
    for (let ref = 0; ref < numRefs; ref++) {
        if (refId === undefined || refId === ref) {
            const refIdData = parseRefIdData(parser);
            refData.push(refIdData);
        } else {
            skipRefIdData(parser);
        }
    }
    return { refData };
}

function parseRefIdData(parser: BinaryParser): BamIndexRefData {
    const binIndex: BinIndex = {};
    const linearIndex = Array<RawVirtualOffset>();

    // Number of distinct bins in reference index
    const numBins = parser.getInt();
    for (let bin = 0; bin < numBins; bin++) {
        const binNumber = parser.getUInt();
        // We don't care about the metadata in pseudo-bins, so just skip in parser.
        if (binNumber == PSEUDO_BIN_MAGIC) {
            // increment by space for 1 int and 4 ulongs. 4 + 8 * 4 = 36.
            parser.position += 36;
            continue;
        }

        const binChunks: Array<RawChunk> = []
        const numChunks = parser.getInt();
        for (let chunk = 0; chunk < numChunks; chunk++) {
            const chunkStart = readVirtualOffset(parser);
            const chunkEnd = readVirtualOffset(parser);
            binChunks.push({ start: chunkStart, end: chunkEnd });
        }

        binIndex[binNumber] = binChunks;
    }

    // Add to linear index
    const numIntervals = parser.getInt();
    for (let interval = 0; interval < numIntervals; interval++) {
        linearIndex.push(readVirtualOffset(parser));
    }
    
    return { binIndex, linearIndex };
}

function skipRefIdData(parser: BinaryParser) {
    // Number of distinct bins in reference index
    const numBins = parser.getInt();
    for (let bin = 0; bin < numBins; bin++) {
        const binNumber = parser.getUInt();
        // We don't care about the metadata in pseudo-bins, so just skip in parser.
        if (binNumber == PSEUDO_BIN_MAGIC) {
            // increment by space for 1 int and 4 ulongs. 4 + 8 * 4 = 36.
            parser.position += 36;
            continue;
        }

        const numChunks = parser.getInt();
        for (let chunk = 0; chunk < numChunks; chunk++) {
            // increment by space for 2 virtual offsets. 8 + 8 = 16.
            parser.position += 16;
        }
    }

    const numIntervals = parser.getInt();
    for (let interval = 0; interval < numIntervals; interval++) {
        parser.position += 8;
    }
}

/**
 * Reads an entire BAM Index and returns a stream of raw index data for only one reference id.
 */
export async function streamRawBamIndex(indexDataLoader: DataLoader, refId: number): Promise<Readable> {
    const bufferedLoader = new BufferedDataLoader(indexDataLoader, undefined, true);
    let pos = 0;
    const stream = new Readable({ objectMode: true, read() {} });

    const load = async (bytes: number, streamData: boolean = false): Promise<ArrayBuffer> => {
        const data = await bufferedLoader.load(pos, bytes);
        if (streamData) stream.push(data);
        pos += bytes;
        return data;
    }
    const loadParser = async (bytes: number, streamData: boolean = false): Promise<BinaryParser> => 
        new BinaryParser(await load(bytes, streamData));

    let parser = await loadParser(8);
    const magic = parser.getInt();
    if (magic !== BAI_MAGIC) {
        throw new Error('Not a BAI file');
    }

    // Number of reference sequences
    const numRefs = parser.getInt();
    for (let ref = 0; ref < numRefs; ref++) {
        const streamData = refId === ref;
        const numBins = (await loadParser(4, streamData)).getInt();
        for (let bin = 0; bin < numBins; bin++) {
            const binNumber = (await loadParser(4, streamData)).getUInt();
            if (binNumber == PSEUDO_BIN_MAGIC) {
                await load(36, streamData);
                continue;
            }

            const numChunks = (await loadParser(4, streamData)).getInt();
            for (let chunk = 0; chunk < numChunks; chunk++) {
                // increment by space for 2 virtual offsets. 8 + 8 = 16.
                await load(16, streamData);
            }
        }

        const numIntervals = (await loadParser(4, streamData)).getInt();
        for (let interval = 0; interval < numIntervals; interval++) {
            await load(8, streamData);
        }
        
        // If this was the reference we wanted to stream, stop streaming.
        if (streamData) break;
    }

    stream.push(null);
    return stream;
}

/**
 * Parse raw index data from a single reference id.
 */
export function parseRawIndexRefData(data: ArrayBuffer): BamIndexRefData {
    return parseRefIdData(new BinaryParser(data));
}

function readVirtualOffset(parser: BinaryParser): RawVirtualOffset {
    const rawVO = new Uint8Array(8);
    for (let i = 0; i < 8; i++) rawVO[i] = parser.getByte();
    return rawVO;
}

function inflateVirtualOffset(raw: RawVirtualOffset): VirtualOffset {    
    const dataPosition = raw[1] << 8 | raw[0];
    const blockPosition = 
        raw[7] * 0x10000000000 +
        raw[6] * 0x100000000 +
        raw[5] * 0x1000000 +
        raw[4] * 0x10000 +
        raw[3] * 0x100 +
        raw[2];
    return { blockPosition, dataPosition };
}

export function inflateChunk(raw: RawChunk): Chunk {
    return {
        start: inflateVirtualOffset(raw.start),
        end: inflateVirtualOffset(raw.end)
    }
}

/**
 * Calculate the list of bins that overlap with region [beg, end]
 */
function reg2bins(start: number, end: number): Array<number> {
    const list = [0];
    if (end >= 1 << 29) end = 1 << 29;
    end--;
    for (let k = 1 + (start >> 26); k <= 1 + (end >> 26); k++) list.push(k);
    for (let k = 9 + (start >> 23); k <= 9 + (end >> 23); k++) list.push(k);
    for (let k = 73 + (start >> 20); k <= 73 + (end >> 20); k++) list.push(k);
    for (let k = 585 + (start >> 17); k <= 585 + (end >> 17); k++) list.push(k);
    for (let k = 4681 + (start >> 14); k <= 4681 + (end >> 14); k++) list.push(k);
    return list;
}
