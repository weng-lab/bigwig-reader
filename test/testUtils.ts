import { Readable } from "stream";

export function streamToArray<T> (stream: Readable): Promise<T[]> {
    const chunks: T[] = [];
    return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(chunks));
    });
}

export function appendBuffers(buffers: ArrayBuffer[]) {
    const lenSum = buffers.reduce((a, b) => a + b.byteLength, 0);
    const tmp = new Uint8Array(lenSum);
    let pos = 0;
    for(let b of buffers) {
      tmp.set(new Uint8Array(b), pos);
      pos += b.byteLength;
    }
    return tmp.buffer;
}