import { DataLoader } from "../loader/DataLoader";
import { BinaryParser } from "../util/BinaryParser";
import { inflate } from "pako";
import { appendBuffer } from "../util/misc";

export interface BamHeader {
    text: string,
    chromToId: { [chrom: string]: number },
    idToChrom: Array<string>;
}

const BAM_MAGIC = 0x014d4142;

class BamHeaderReader {

    private parser?: BinaryParser;
    private rawLoadedData?: ArrayBuffer;

    constructor(private bamDataLoader: DataLoader, private fetchSize: number = 56_000) {}

    async readHeaderData(): Promise<BamHeader> {
        const magic = await this.readUInt();
        if (magic !== BAM_MAGIC) throw Error("Invalid Bam File!");
        const textLen = await this.readInt();
        const headerText = await this.readString(textLen);
        const numRefs = await this.readInt();
        const chromToId: { [chrom: string]: number } = {};
        const idToChrom: Array<string> = [];
        for (let refId = 0; refId < numRefs; refId++) {
            const nameLen = await this.readInt();
            const refName = await this.readString(nameLen);
            // Skip the next field as well, chrom length, since we don't need it.
            await this.readInt();
            
            chromToId[refName] = refId;
            idToChrom.push(refName);
        }
        return { text: headerText, chromToId, idToChrom };
    }

    private async readUInt(): Promise<number> {
        await this.loadIfNeeded(4);
        return this.parser!.getUInt();
    }

    private async readInt(): Promise<number> {
        await this.loadIfNeeded(4);
        return this.parser!.getInt();
    }

    private async readString(len: number): Promise<string> {
        await this.loadIfNeeded(len);
        return this.parser!.getString(len);
    }

    private async loadIfNeeded(bytesNeeded: number) {
        if (this.parser !== undefined && this.parser.remLength() >= bytesNeeded) return;
        const start = this.rawLoadedData === undefined ? 0 : this.rawLoadedData.byteLength;
        const newHeaderData: ArrayBuffer = await this.bamDataLoader.load(start, this.fetchSize);
        this.rawLoadedData = this.rawLoadedData === undefined ? newHeaderData : 
            appendBuffer(this.rawLoadedData, newHeaderData);
        const unzippedHeaderData = inflate(new Uint8Array(this.rawLoadedData));
        const currentParserPos = this.parser === undefined ? 0 : this.parser.position;
        this.parser = new BinaryParser(unzippedHeaderData.buffer);
        this.parser.position = currentParserPos;
    }

}

export async function readBamHeaderData(bamDataLoader: DataLoader, fetchSize?: number): Promise<BamHeader> {
    return new BamHeaderReader(bamDataLoader, fetchSize).readHeaderData();
}