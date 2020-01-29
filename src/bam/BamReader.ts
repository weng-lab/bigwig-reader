import { DataLoader } from "../loader/DataLoader";
import { readBamHeaderData, BamHeader } from "./BamHeaderReader";
import { blocksForRange, Chunk, BamIndexData, readBamIndex } from "./BamIndexReader";
import { bgzfUnzip } from "./Bgzf";
import { BinaryParser } from "../util/BinaryParser";

export interface CigarOp {
    opLen: number;
    op: string;
    seqOffset: number;
}

export interface BamAlignmentMate {
    chr: string;
    position: number;
    strand: boolean;
}

/* TODO
export interface BamAlignmentTag {
    name: string;
    value: any;
}
*/

export interface BamAlignment {
    chr: string;
    start: number;
    flags: number;
    strand: boolean;
    readName: string;
    cigarOps: Array<CigarOp>;
    templateLength: number;
    mappingQuality: number;
    seq: string;
    phredQualities: Array<number>;
    lengthOnRef: number;
}

export function isFlagged(bitwiseFlags: number, flag: BamAlignmentFlag): boolean {
    return !!(bitwiseFlags & flag);
}

export enum BamAlignmentFlag {
    // template having multiple segments in sequencing
    READ_PAIRED = 0x1,
    // each segment properly aligned according to the aligner
    PROPER_PAIR = 0x2,
    // segment unmapped
    READ_UNMAPPED = 0x4,
    // next segment in the template unmapped
    MATE_UNMAPPED = 0x8,
    // SEQ being reverse complemented
    READ_STRAND = 0x10,
    // SEQ of the next segment in the template being reverse complemented
    MATE_STRAND = 0x20,
    // the first segment in the template
    FIRST_OF_PAIR = 0x40,
    // the last segment in the template
    SECOND_OF_PAIR = 0x80,
    // secondary alignment
    SECONDARY_ALIGNMNET = 0x100,
    // not passing filters, such as platform/vendor quality controls
    READ_FAILS_VENDOR_QUALITY_CHECK = 0x200,
    // PCR or optical duplicate
    DUPLICATE_READ = 0x400,
    // supplementary alignment
    SUPPLEMENTARY_ALIGNMENT = 0x800
}

const CIGAR_DECODER = "MIDNSHP=X";
const SEQ_CONSUMING_CIGAR_OPS = "MIS=X";
const REF_CONSUMING_CIGAR_OPS = "MDN=X";
const SEQ_DECODER = "=ACMGRSVTWYHKDBN";

/**
 * BamReader class that can read ranges of data from BAM alignment files with and index.
 * Needs to read entire index to work. Caches index and header.
 */
export class BamReader {
    
    constructor(private bamDataLoader: DataLoader, private bamIndexDataLoader: DataLoader) { }

    private indexData?: BamIndexData = undefined;
    async getIndexData(): Promise<BamIndexData> {
        if (this.indexData === undefined) {
            this.indexData = await readBamIndex(this.bamIndexDataLoader);
        }
        return this.indexData;
    }

    private headerData?: BamHeader = undefined;
    async getHeaderData(): Promise<BamHeader> {
        if (this.headerData === undefined) {
            const indexData = await this.getIndexData();
            this.headerData = await readBamHeaderData(this.bamDataLoader, indexData.firstAlignmentBlock);
        }
        return this.headerData;
    }

    async read(chr: string, start: number, end: number): Promise<Array<BamAlignment>> {
        const indexData = await this.getIndexData();
        const headerData = await this.getHeaderData();
        const refId = headerData.chromToId[chr];
        const chunks: Array<Chunk> = blocksForRange(indexData.refData[refId], refId, start, end);
        return await readBam(this.bamDataLoader, chunks, refId, chr, start, end);
    }

}

/**
 * Reads alignments from a bam file given file regions to look ("chunks") from an index and search parameters.
 * 
 * @param bamDataLoader the data loader for the bam file.
 * @param chunks regions to look for matching alignments.
 * @param refId The file's reference id for the given chromosome.
 * @param chr the chr
 * @param start 
 * @param end 
 */
export async function readBam(bamDataLoader: DataLoader, chunks: Array<Chunk>, refId: number, chr: string,
    start: number, end: number): Promise<Array<BamAlignment>> {
    const alignments = Array<BamAlignment>();
    for (let chunk of chunks) {
        const bufSize = chunk.end.blockPosition + (1 << 16) - chunk.start.blockPosition;
        const chunkBytes: ArrayBuffer = await bamDataLoader.load(chunk.start.blockPosition, bufSize);
        const unzippedChunk: ArrayBuffer = bgzfUnzip(chunkBytes);
        const chunkAlignments = readBamFeatures(unzippedChunk.slice(chunk.start.dataPosition),
            refId, chr, start, end);
        // Append all chunk alignments to alignments
        chunkAlignments.forEach(ca => alignments.push(ca));
    }
    return alignments;
}

/**
 * Parses bam features from raw unzipped data.
 * 
 * @param blocksData blocks of uncompressed data to parse bam alignments from.
 * @param refId lookup reference id
 * @param chr name of chromosome for reference id.
 * @param bpStart lookup start base pair
 * @param bpEnd lookup end base pair
 */
function readBamFeatures(blocksData: ArrayBuffer, refId: number, chr: string,
    bpStart: number, bpEnd: number): Array<BamAlignment> {
    const parser = new BinaryParser(blocksData);

    const alignments = new Array<BamAlignment>();
    while (parser.position < blocksData.byteLength) {
        const blockSize = parser.getInt();
        const blockEnd = parser.position + blockSize;

        // If we don't have enough data to read, exit.
        if (blockSize + parser.position > blocksData.byteLength) break;

        const blockRefID = parser.getInt();
        const pos = parser.getInt();
        const readNameLen = parser.getByte();
        const mappingQuality = parser.getByte();
        const bin = parser.getUShort();
        const numCigarOps = parser.getUShort();
        const flags = parser.getUShort();
        const strand = !isFlagged(flags, BamAlignmentFlag.READ_STRAND);
        const seqLen = parser.getInt();
        const mateChrIdx = parser.getInt();
        const matePos = parser.getInt();
        const templateLen = parser.getInt();
        const readName = parser.getString(readNameLen);

        // If read is unmapped or read does not overlap with given chr, start, and end, continue
        if (blockRefID === -1 || refId !== blockRefID || pos > bpEnd || pos + seqLen < bpStart) {
            parser.position = blockEnd;
            continue;
        }

        // Build CIGAR
        const cigarOps = new Array<CigarOp>();
        let seqOffset = 0;
        let lengthOnRef = 0;
        for (let i = 0; i < numCigarOps; i++) {
            const rawCigar = parser.getUInt();
            const opLen = rawCigar >> 4;
            const op = CIGAR_DECODER.charAt(rawCigar & 0xf);

            cigarOps.push({ opLen, op, seqOffset });

            if (SEQ_CONSUMING_CIGAR_OPS.includes(op)) {
                seqOffset += opLen;
            }
            if (REF_CONSUMING_CIGAR_OPS.includes(op)) {
                lengthOnRef += opLen;
            }
        }

        // Build sequence
        const seqChars = new Array<string>();
        const seqBytes = (seqLen + 1) / 2;
        for (let i = 0; i < seqBytes; i++) {
            const seqByte = parser.getByte();
            seqChars.push(SEQ_DECODER.charAt((seqByte & 0xf0) >> 4));
            seqChars.push(SEQ_DECODER.charAt(seqByte & 0x0f));
        }
        // Slice because seqChars might have one extra character (if seqLen is an odd number)
        const sequence = seqChars.slice(0, seqLen).join('');

        // Build Phred-scaled base qualities
        const phredQualities = new Array<number>();
        for (let i = 0; i < seqLen; i++) {
            phredQualities.push(parser.getByte());
        }

        // Add Mate
        let mate: BamAlignmentMate;
        if (mateChrIdx >= 0) {
            mate = {
                chr: chr,
                position: matePos,
                strand: !isFlagged(flags, BamAlignmentFlag.MATE_STRAND)
            }
        }

        alignments.push({
            chr: chr,
            start: pos,
            flags: flags,
            strand: strand,
            readName: readName,
            cigarOps: cigarOps,
            templateLength: templateLen,
            mappingQuality: mappingQuality,
            seq: sequence,
            phredQualities: phredQualities,
            lengthOnRef: lengthOnRef
        });

        // We need to jump to the end of the block here because we're skipping reading tags.
        parser.position = blockEnd;
    }

    return alignments;
}