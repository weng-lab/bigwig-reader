import { AxiosInstance, AxiosResponse } from "axios";

/**
 * Interface for loading data.
 * The application logic doesn't care if the data comes from a local file, 
 * an http request, ftp, cloud storage request, etc...
 * 
 * A single implementation of this class is to be provided when constructing BigWigReader.
 */
export interface DataLoader {
    // Loads data for the given range
    load: (start: number, size?: number) => Promise<ArrayBuffer>;
    
    // Should return file size in bytes
    fileSize: () => Promise<number>;
}

/**
 * DataLoader for http range requests using Axios library.
 * You can pass in your own request configuration via the axios arg in the constructor.
 */
export class AxiosDataLoader implements DataLoader {

    private cachedFileSize: number|undefined = undefined;

    constructor(private url: string, private axios: AxiosInstance) {}

    async load(start: number, size?: number): Promise<ArrayBuffer> {
        const response: AxiosResponse<ArrayBuffer|Buffer> = await this.axios.get(this.url, { 
            responseType: 'arraybuffer', 
            headers: { "Range": `bytes=${start}-${size ? start+size-1 : ""}`}
        });

        // If this is running on node.js axios will return node.js "Buffer" objects for arraybuffer requests
        if (response.data instanceof Buffer) {
            return new Uint8Array(response.data).buffer as ArrayBuffer;
        } else {
            return response.data;
        }
    }

    async fileSize(): Promise<number> {
        if (undefined === this.cachedFileSize) {
            this.cachedFileSize = parseInt((await this.axios.head(this.url)).headers['content-length']);
        }
        return this.cachedFileSize;
    }

}

/**
 * Wrapper for other DataLoaders that buffers. Used internally by the BigWigReader.
 * This class does not implement DataLoader. It is not meant to be passed in in BigWigReader as the DataLoader you must provide.
 * 
 * When you initially request data, potentially much more (bufferSize) than you ask for is loaded into a buffer.
 * This buffer is checked first for subsequent requests.
 */
export class BufferedDataLoader {

    private buffer?: LoaderBuffer;

    constructor(private dataLoader: DataLoader, private bufferSize: number, private fileSize: number){}

    async load(start: number, size: number): Promise<ArrayBuffer> {
        // If the data is in the buffer, return it.
        const bufferedData = this.getDataFromBuffer(start, size);
        if (undefined !== bufferedData) {
            return bufferedData;
        }

        // If the data is not in the buffer. Load some new data into the buffer.
        const newBufferEnd = Math.min(start + this.bufferSize, this.fileSize);
        const newBufferSize = newBufferEnd - start;
        this.buffer = {
            data: await this.dataLoader.load(start, newBufferSize),
            start: start,
            size: newBufferSize
        }

        return this.buffer.data.slice(0, Math.min(newBufferSize, size));
    }

    /**
     * @returns the given ranges data if it's currently in the buffer. Otherwise returns undefined.
     */
    private getDataFromBuffer(start: number, size: number): ArrayBuffer|undefined {
        if (this.buffer === undefined) {
            return undefined;
        }
        const end = start + size;
        const bufferEnd = this.buffer.start + this.buffer.size;
        if (start > this.buffer.start && end < bufferEnd) {
            const sliceStart = start - this.buffer.start;
            const sliceEnd = sliceStart + size;
            return this.buffer.data.slice(sliceStart, sliceEnd);
        }
        return undefined;
    }

}

interface LoaderBuffer {
    data: ArrayBuffer,
    start: number,
    size: number
}