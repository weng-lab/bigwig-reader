import { DataLoader, OutOfRangeError } from './DataLoader';
import Axios, { AxiosInstance, AxiosResponse } from "axios";
import { Readable } from 'stream';

/**
 * DataLoader for http range requests using Axios library.
 * You can pass in your own request configuration via the axios arg in the constructor.
 */
export class AxiosDataLoader implements DataLoader {

    private cachedFileSize: number|undefined = undefined;

    constructor(private url: string, private axios: AxiosInstance = Axios.create()) {}

    async load(start: number, size?: number): Promise<ArrayBuffer> {
        const response: AxiosResponse<ArrayBuffer|Buffer> = await this.axios.get(this.url, { 
            responseType: 'arraybuffer', 
            headers: { "Range": `bytes=${start}-${size ? start+size-1 : ""}`}
        });

        // If we get an out of range response
        if (416 == response.status) {
            throw new OutOfRangeError(this.url, start, size);
        }

        // If this is running on node.js axios will return node.js "Buffer" objects for arraybuffer requests
        if (response.data instanceof Buffer) {
            return new Uint8Array(response.data).buffer as ArrayBuffer;
        } else {
            return response.data;
        }
    }

    async loadStream(start: number, size?: number): Promise<Readable> {
        const response: AxiosResponse<Readable> = await this.axios.get(this.url, { 
            responseType: 'stream', 
            headers: { "Range": `bytes=${start}-${size ? start+size-1 : ""}`}
        });

        // If we get an out of range response
        if (416 == response.status) {
            throw new OutOfRangeError(this.url, start, size);
        }

        return response.data;
    }

}