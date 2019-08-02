import { DataLoader } from "../DataLoader";
import { readBamHeaderData, BamHeader } from "./BamHeaderReader";
import { readBamIndex } from "./BamIndexReader";

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

export interface BamAlignment {
    flags: BamAlignmentFlag[]
}

const MAX_GZIP_BLOCK_SIZE = 65536; // See BGZF compression format in SAM format specification

export class BamReader {

    constructor(private bamDataLoader: DataLoader, private bamIndexDataLoader: DataLoader) { }

    async read(chr: string, start: number, end: number) {
        const headerData: BamHeader = await readBamHeaderData(this.bamDataLoader);
        const refId = headerData.chromToId[chr];
        const partialIndex = await readBamIndex(this.bamIndexDataLoader, [refId], );
    }

}