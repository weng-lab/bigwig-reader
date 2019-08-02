import { DataLoader, BufferedDataLoader } from "../DataLoader";
import { BinaryParser } from "../BinaryParser";

export interface BamHeader {
    text: string,
    chromToId: { [chrom: string]: number }
}

const BAM_MAGIC = 21840194;
const BUFFER_SIZE = 128000;

export async function readBamHeaderData(bamDataLoader: DataLoader): Promise<BamHeader> {
    const bufferedLoader = new BufferedDataLoader(bamDataLoader, BUFFER_SIZE);
    const magic = new BinaryParser(await bufferedLoader.load(0, 4)).getInt();
    if (magic !== BAM_MAGIC) throw Error("Invalid Bam File!");
    const textLen = new BinaryParser(await bufferedLoader.load(4, 4)).getInt();
    const headerText = new BinaryParser(await bufferedLoader.load(8, textLen)).getString(textLen);
    let currentPos = 8 + textLen;
    const numRefs = new BinaryParser(await bufferedLoader.load(currentPos, 4)).getInt();
    currentPos += 4;
    const chromToId: { [chrom: string]: number } = {};
    for (let refId = 0; refId < numRefs; refId++) {
        const nameLen = new BinaryParser(await bufferedLoader.load(currentPos, 4)).getInt();
        currentPos += 4;
        const refName = new BinaryParser(await bufferedLoader.load(currentPos, nameLen)).getString(nameLen);
        // Skip the next field as well, chrom length, since we don't need it.
        currentPos += nameLen + 4;
        chromToId[refName] = refId;
    }
    return { text: headerText, chromToId: chromToId };
}
