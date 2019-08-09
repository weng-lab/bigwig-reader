import { DataLoader } from "../DataLoader";
import { readBamHeaderData, BamHeader } from "./BamHeaderReader";
import { blocksForRange, Chunk, BamIndexData, readBamIndex } from "./BamIndexReader";
import { bgzfUnzip } from "./Bgzf";
import { BinaryParser } from "../BinaryParser";

enum BamAlignmentFlag {
    READ_PAIRED,
    PROPER_PAIR,
    READ_UNMAPPED,
    MATE_UNMAPPED,
    READ_STRAND,
    MATE_STRAND,
    FIRST_OF_PAIR,
    SECOND_OF_PAIR,
    SECONDARY_ALIGNMNET,
    READ_FAILS_VENDOR_QUALITY_CHECK,
    DUPLICATE_READ,
    SUPPLEMENTARY_ALIGNMENT
}

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

}

const MAX_GZIP_BLOCK_SIZE = 65536; // See BGZF compression format in SAM format specification
const CIGAR_DECODER = "MIDNSHP=X";
const SEQ_CONSUMING_CIGAR_OPS = "MIS=X";
const SEQ_DECODER = "=ACMGRSVTWYHKDBN";
const READ_STRAND_FLAG = 0x10;
const MATE_STRAND_FLAG = 0x20;

export class BamReader {

    constructor(private bamDataLoader: DataLoader, private bamIndexDataLoader: DataLoader) { }

    async read(chr: string, start: number, end: number): Promise<Array<BamAlignment>> {
        const indexData: BamIndexData = await readBamIndex(this.bamIndexDataLoader);
        const headerData: BamHeader = await readBamHeaderData(this.bamDataLoader, indexData.firstAlignmentBlock);
        const refId = headerData.chromToId[chr];
        const chunks: Array<Chunk> = await blocksForRange(indexData, refId, start, end);
        const alignments = Array<BamAlignment>();
        for (let chunk of chunks) {
            const bufSize = chunk.end.blockPosition + (1 << 16) - chunk.start.blockPosition;
            const chunkBytes: ArrayBuffer = await this.bamDataLoader.load(chunk.start.blockPosition, bufSize);
            const unzippedChunk: ArrayBuffer = bgzfUnzip(chunkBytes);
            const chunkAlignments = readBamFeatures(unzippedChunk.slice(chunk.start.dataPosition), 
                headerData.idToChrom, refId, start, end);
            alignments.concat(chunkAlignments);
        }
        return alignments;
    }

}

/**
 * Parses
 * 
 * @param blocksData blocks of uncompressed data to parse bam alignments from.
 * @param idToChr map of reference (chromosome) ids (used by file) to names.
 * @param refId lookup reference id
 * @param bpStart lookup start base pair
 * @param bpEnd lookup end base pair
 */
function readBamFeatures(blocksData: ArrayBuffer, idToChr: Array<string>, refId: number, 
        bpStart: number, bpEnd: number): Array<BamAlignment> {
    const parser = new BinaryParser(blocksData);

    const alignments = new Array<BamAlignment>()
    while (parser.position < blocksData.byteLength) {
        const blockSize = parser.getInt();
        
        // If we don't have enough data to read, exit.
        if (blockSize + parser.position > blocksData.byteLength) break;

        const blockRefID = parser.getInt();
        const pos = parser.getInt();
        const readNameLen = parser.getByte();
        const mappingQuality = parser.getByte();
        const bin = parser.getUShort();
        const numCigarOps = parser.getUShort();
        const flags = parser.getUShort();
        const strand = !(flags & READ_STRAND_FLAG);
        const seqLen = parser.getInt();
        const mateChrIdx = parser.getInt();
        const matePos = parser.getInt();
        const templateLen = parser.getInt();
        const readName = parser.getString(readNameLen);
    
        // If read is unmapped or read does not overlap with given chr, start, and end, continue
        if (blockRefID === -1 || refId !== blockRefID || pos > bpEnd || 
            pos + seqLen < bpStart) continue;

        // Build CIGAR
        const cigarOps = new Array<CigarOp>();
        let seqOffset = 0;
        for (let i = 0; i < numCigarOps; i++) {
            const rawCigar = parser.getUInt();
            const opLen = rawCigar >> 4;
            const op = CIGAR_DECODER.charAt(rawCigar & 0xf);
            
            cigarOps.push({ opLen, op, seqOffset });
            if (SEQ_CONSUMING_CIGAR_OPS.includes(op)) {
                seqOffset += opLen;
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
        const phred = new Array<number>();
        for (let i = 0; i < seqBytes; i++) {
            phred.push(parser.getByte());
        }
    
        // Add Mate
        let mate: BamAlignmentMate;
        if (mateChrIdx >= 0) {
            mate = {
                chr: idToChr[mateChrIdx],
                position: matePos,
                strand: !(flags & MATE_STRAND_FLAG)
            }
        }
    
        alignments.push({
            chr: idToChr[blockRefID],
            start: pos,
            flags: flags,
            strand: strand,
            readName: readName,
            cigarOps: cigarOps,
            templateLength: templateLen,
            mappingQuality: mappingQuality
        });
    }
    return alignments;
}