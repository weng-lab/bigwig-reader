import { DataLoader } from "../DataLoader";
import { BinaryParser } from "../BinaryParser";


export interface VirtualOffset {
    // Offset of the compressed data block
    blockPosition: number,
    // Offset into the uncompressed data
    dataPosition: number
}

export interface Chunk {
    start: VirtualOffset,
    end: VirtualOffset
}

export interface BinIndex {
    [binNumber: string]: Array<Chunk>
}

export interface BamIndexRefData {
    binIndex: BinIndex, 
    linearIndex: Array<VirtualOffset>
}

// Top Level Representation of Parsed Index
export interface BamIndexData {
    firstAlignmentBlock: number;
    // array of index data per reference id, where reference id is array index.
    refData: Array<BamIndexRefData>
}

const BAI_MAGIC = 21578050;
const PSEUDO_BIN_MAGIC = 37450;

/**
 * 
 * @param bamIndexRefData 
 * @param refId 
 * @param start 
 * @param end 
 */
export async function blocksForRange(indexData: BamIndexData, refId: number, 
        start: number, end: number): Promise<Array<Chunk>> {
    const overlappingBins: Array<number> = reg2bins(start, end);
    const binIndex: BinIndex = indexData.refData[refId].binIndex;
    const linearIndex: Array<VirtualOffset> = indexData.refData[refId].linearIndex;
    
    // Get all chunks for overlapping bins.
    let allChunks: Array<Chunk> = [];
    for (let bin in binIndex) {
        if (overlappingBins.includes(Number(bin))) continue;
        allChunks = allChunks.concat(binIndex[bin]);
    }

    // Use the linear index to find minimum file position of chunks that could 
    // contain alignments in the region.
    let lowest: VirtualOffset | undefined = undefined;
    const minLin = Math.min(start >> 14, linearIndex.length - 1);
    const maxLin = Math.max(start >> 14, linearIndex.length - 1);
    for (let i = minLin; i <= maxLin; i++) {
        let offset: VirtualOffset = linearIndex[i];
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
        var dif = c0.start.blockPosition - c1.start.blockPosition;
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

export async function readBamIndex(indexDataLoader: DataLoader): Promise<BamIndexData> {
    const indexData: ArrayBuffer = await indexDataLoader.load(0);
    const parser = new BinaryParser(indexData);
    const magic = parser.getInt();
    if (magic !== BAI_MAGIC) {
        throw new Error('Not a BAI file');
    }

    let firstAlignmentBlock: number | undefined = undefined;
    const refData: Array<BamIndexRefData> = [];

    // Number of reference sequences
    const numRefs = parser.getInt();
    for (let ref = 0; ref < numRefs; ref++) {
        const binIndex: BinIndex = {};
        const linearIndex = Array<VirtualOffset>();

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

            const binChunks: Array<Chunk> = []
            const numChunks = parser.getInt();
            for (let chunk = 0; chunk < numChunks; chunk++) {
                const chunkStart = readVirtualOffset(parser);
                const chunkEnd = readVirtualOffset(parser);
                binChunks.push({ start: chunkStart, end: chunkEnd });
                if (firstAlignmentBlock === undefined || firstAlignmentBlock < chunkStart.blockPosition) {
                    firstAlignmentBlock = chunkStart.blockPosition;
                }
            }

            binIndex[binNumber] = binChunks;
        }

        // Add to linear index
        const numIntervals = parser.getInt();
        for (let interval = 0; interval < numIntervals; interval++) {
            linearIndex.push(readVirtualOffset(parser));
        }
        
        refData.push({ binIndex, linearIndex });
    }
    return { firstAlignmentBlock: firstAlignmentBlock as number, refData };
}

function readVirtualOffset(parser: BinaryParser): VirtualOffset {
    const bytes: Array<number> = []
    for (let i = 0; i < 8; i++) bytes[i] = parser.getByte();
    
    const dataPosition = bytes[1] << 8 | bytes[0];
    const blockPosition = 
        bytes[7] * 0x10000000000 +
        bytes[6] * 0x100000000 +
        bytes[5] * 0x1000000 +
        bytes[4] * 0x10000 +
        bytes[3] * 0x100 +
        bytes[2];
    return { blockPosition, dataPosition };
}

/**
 * Calculate the list of bins that overlap with region [beg, end]
 */
function reg2bins(start: number, end: number): Array<number> {
    const list = [0];
    end--;
    for (let k = 1 + (start >> 26); k <= 1 + (end >> 26); k += 1) list.push(k);
    for (let k = 9 + (start >> 23); k <= 9 + (end >> 23); k += 1) list.push(k);
    for (let k = 73 + (start >> 20); k <= 73 + (end >> 20); k += 1) list.push(k);
    for (let k = 585 + (start >> 17); k <= 585 + (end >> 17); k += 1) list.push(k);
    for (let k = 4681 + (start >> 14); k <= 4681 + (end >> 14); k += 1) list.push(k);
    return list;
}
