import { Chunk } from "./BamIndexReader";
import { Inflate } from "pako";

/**
 * Decompress bgzf encoded data.
 * 
 * @param inputData 
 * @param chunk If unzipping for a "chunk" do extra counting and trimming to return only 
 *      exactly the data range specified in the chunk.
 */
export function bgzfUnzip(inputData: ArrayBuffer, chunk?: Chunk): ArrayBuffer {
    let pos = 0;
    const decompressedBlocks: Array<Uint8Array> = [];
    const fileStartingOffset: number | undefined = chunk !== undefined ? chunk.start.blockPosition : undefined;
    let stream: any;
    do {
        const remainingInput = inputData.slice(pos);
        const inflator: any = new Inflate();
        stream = inflator.strm;
        inflator.push(remainingInput, 2);
        if (inflator.err) throw new Error(inflator.msg);
        decompressedBlocks.push(inflator.result as Uint8Array);

        if (chunk !== undefined) {
            if (decompressedBlocks.length === 1 && chunk.start.dataPosition) {
                // this is the first chunk, trim it
                decompressedBlocks[0] = decompressedBlocks[0].slice(chunk.start.dataPosition)
            }
            if (fileStartingOffset as number + pos >= chunk.end.blockPosition) {
                // this is the last chunk, trim it and stop decompressing
                // note if it is the same block is minv it subtracts that already
                // trimmed part of the slice length
                const newEnd = chunk.end.blockPosition === chunk.start.blockPosition ?
                    chunk.end.dataPosition - chunk.start.dataPosition + 1 : chunk.end.dataPosition + 1;
                const lastIndex = decompressedBlocks.length - 1;
                decompressedBlocks[lastIndex] = decompressedBlocks[lastIndex].slice(0, newEnd);
                break;
            }
        }
        pos += stream.next_in;
    } while (stream.avail_in)

    const result: Uint8Array = mergedTypedArrays(decompressedBlocks, Uint8Array);
    return result.buffer;
}

function mergedTypedArrays(arrays: Array<any>, type = Uint8Array) {
    const ret = new (type)(arrays.reduce((acc, arr) => acc + arr.byteLength, 0));
    let off = 0;
    arrays.forEach((arr) => {
        ret.set(arr, off);
        off += arr.byteLength;
    });
    return ret;
}