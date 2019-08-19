import { DataLoader } from "../loader/DataLoader";
import { BinaryParser } from "../util/BinaryParser";
import { bgzfUnzip } from "./Bgzf";

export interface BamHeader {
    text: string,
    chromToId: { [chrom: string]: number },
    idToChrom: Array<string>;
}

const MAX_GZIP_BLOCK_SIZE = 65536;
const BAM_MAGIC = 0x014d4142;

export async function readBamHeaderData(bamDataLoader: DataLoader, firstAlignmentBlock: number): Promise<BamHeader> {
    const headerData: ArrayBuffer = await bamDataLoader.load(0, firstAlignmentBlock + MAX_GZIP_BLOCK_SIZE);
    const unzippedHeaderData = bgzfUnzip(headerData);
    const parser = new BinaryParser(unzippedHeaderData);
    const magic = parser.getUInt();
    if (magic !== BAM_MAGIC) throw Error("Invalid Bam File!");
    const textLen = parser.getInt();
    const headerText = parser.getString(textLen);
    const numRefs = parser.getInt();
    const chromToId: { [chrom: string]: number } = {};
    const idToChrom: Array<string> = [];
    for (let refId = 0; refId < numRefs; refId++) {
        const nameLen = parser.getInt();
        const refName = parser.getString(nameLen);
        // Skip the next field as well, chrom length, since we don't need it.
        parser.getInt();
        
        chromToId[refName] = refId;
        idToChrom.push(refName);
    }
    return { text: headerText, chromToId, idToChrom };
}