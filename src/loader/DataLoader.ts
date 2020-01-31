import { Readable } from "stream";
import { rejects } from "assert";

export enum ErrorType {
    OUT_OF_RANGE = "OUT_OF_RANGE",
    DATA_MISSING = "DATA_MISSING",
    IO = "IO",
    FILE_FORMAT = "FILE_FORMAT"
};

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
    // Loads data into a stream for the given range
    loadStream?: (start: number, size?: number) => Promise<Readable>;
}

/**
 * Error that get's returned when we try to read data from a file that's out of bounds.
 */
export class OutOfRangeError extends Error {
    errortype = ErrorType.OUT_OF_RANGE;
    constructor(public resource: string, public start: number, public size?: number){
        super(`Request on ${resource} out of range. Range given: ${start}-${size||''}`);
    }
}

/**
 * Error thrown when we try to read data from a chromosome not present in a given file.
 */
export class DataMissingError extends Error {
    errortype = ErrorType.DATA_MISSING;
    constructor(public chromosome: string) {
	    super(`Given chromosome ${chromosome} not found in file header chromosome tree`);
    }
}

/**
 * Error thrown when there is an I/O error in the underlying DataReader.
 */
export class IOError extends Error {
    errortype = ErrorType.IO;
    constructor(public message: string) {
	    super(message);
    }
}

/**
 * Error thrown when the remote file is corrupt or an invalid request is made for the given file format.
 */
export class FileFormatError extends Error {
    errortype = ErrorType.FILE_FORMAT;
    constructor(public message: string) {
	    super(message);
    }
}

/**
 * Wrapper for other DataLoaders that buffers. 
 * Used internally by the BigWigReader. This class does not implement DataLoader. 
 * It is not meant to be passed in in BigWigReader as the DataLoader you must provide.
 * 
 * When you initially request data, potentially much more (bufferSize) than you ask for is loaded into a buffer.
 * This buffer is checked first for subsequent requests.
 */
export class BufferedDataLoader {

    private buffer?: LoaderBuffer;
    private stream?: Readable;

    // These two are for waiting for data in stream mode.
    private streamCaughtUpLock?: StreamCaughtUpLock;

    constructor(
        private dataLoader: DataLoader, 
        private bufferSize: number, 
        private streamMode: boolean = false) {}

    async load(start: number, size: number): Promise<ArrayBuffer> {
        // If the data isn't in the buffer, load it.
        if (!this.bufferContainsData(start, size)) {
            // 
            if (!this.streamMode) {
                await this.loadDataIntoBuffer(start);
            } else {
                await this.streamDataIntoBuffer(start);
            }
        }
        
        return await this.getDataFromBuffer(start, size);
    }

    private async loadDataIntoBuffer(start: number) {
        let data;
        try {
            data = await this.dataLoader.load(start, this.bufferSize);
        } catch (e) {
            // If we're out of range, it could mean reaching the end of the file, so retry without a size bound.
            if (e instanceof OutOfRangeError) {
                data = await this.dataLoader.load(start);
            } else {
                throw e;
            }
        }
        
        this.buffer = {
            data: data,
            start: start
        };
    }

    private async streamDataIntoBuffer(start: number) {
        if (this.dataLoader.loadStream === undefined) {
            throw Error("Stream mode enabled, but DataLoader loadStream function not defined");
        }

        if (this.stream !== undefined) {
            this.stream.destroy();
            this.stream = undefined;
        }
        try {
            this.stream = await this.dataLoader.loadStream(start, this.bufferSize);
        } catch (e) {
            // If we're out of range, it could mean reaching the end of the file, so retry without a size bound.
            if (e instanceof OutOfRangeError) {
                this.stream = await this.dataLoader.loadStream(start);
            } else {
                throw e;
            }
        }

        const buffer = {
            data: new ArrayBuffer(0),
            start: start,
            remainingBytes: this.bufferSize
        };
        this.buffer = buffer;

        this.stream.on('data', (chunk: ArrayBuffer) => {
            buffer.data = appendBuffer(buffer.data, chunk);
            buffer.remainingBytes = buffer.remainingBytes -= chunk.byteLength;
            if (this.streamCaughtUpLock !== undefined) {
                const dataEndPos = buffer.start + buffer.data.byteLength;
                this.streamCaughtUpLock.updatePosition(dataEndPos);
            }
        });
        this.stream.on('end', () => {
            if (this.streamCaughtUpLock !== undefined) {
                this.streamCaughtUpLock.endStream();
            }
        });
    }

    private bufferContainsData(start: number, size: number): boolean {
        if (this.buffer === undefined) return false;
        const end = start + size;
        let bufferEnd = this.buffer.start + this.buffer.data.byteLength;
        if (this.buffer.remainingBytes !== undefined) {
            bufferEnd += this.buffer.remainingBytes;
        }
        return start >= this.buffer.start && end <= bufferEnd;
    }

    /** 
     * @returns the given ranges data if it's currently in the buffer. Otherwise throws error.
     * Works under the assumption that we've already loaded / begun streaming the data.
     */
    private async getDataFromBuffer(start: number, size: number): Promise<ArrayBuffer> {
        if (this.buffer === undefined) {
            throw new Error("Invalid State. Buffer should not be empty");
        }

        const sliceStart = start - this.buffer.start;
        const sliceEnd = sliceStart + size;

        if (this.streamMode === false) {
            if (size > this.buffer.data.byteLength) {
                throw new IOError(`Requested ${size} bytes but only got back ${this.buffer.data.byteLength}`);
            }
            return this.buffer.data.slice(sliceStart, sliceEnd);
        }

        const currentDataEnd = this.buffer.start + this.buffer.data.byteLength;
        const requiredEnd = start + size;
        this.streamCaughtUpLock = new StreamCaughtUpLock(currentDataEnd, requiredEnd);
        await this.streamCaughtUpLock.waitForStream();
        
        const response = this.buffer.data.slice(sliceStart, sliceEnd);
        // Chop off buffer beginning of buffer to save memory
        this.buffer.data = this.buffer.data.slice(sliceEnd, this.buffer.data.byteLength);
        this.buffer.start = this.buffer.start + sliceEnd;

        return response;
    }

}

interface LoaderBuffer {
    data: ArrayBuffer,
    start: number,
    // Used for streaming mode. Holds the number of bytes left to be loaded.
    remainingBytes?: number
}

class StreamCaughtUpLock {

    private promise: Promise<void>;
    private promiseResolve: ((value?: void | PromiseLike<void>) => void)|undefined;
    private promiseReject: ((reason?: string) => void)|undefined;

    constructor(private currentPos: number, private caughtUpPos: number) {
        this.promise = new Promise((resolve, reject) => {
            if(this.currentPos >= this.caughtUpPos) resolve();
            this.promiseResolve = resolve;
            this.promiseReject = reject;
        });
    }

    waitForStream(): Promise<void> {
        return this.promise;
    }

    updatePosition(position: number) { 
        this.currentPos = position;
        if (this.promiseResolve !== undefined && this.currentPos >= this.caughtUpPos) {
            this.promiseResolve();
        }
    }

    endStream() {
        if (this.promiseReject !== undefined && this.currentPos < this.caughtUpPos) {
            this.promiseReject("Stream ended prematurely");
        }
    }
}

function appendBuffer(buffer1: ArrayBuffer, buffer2: ArrayBuffer): ArrayBuffer {
    var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    tmp.set(new Uint8Array(buffer1), 0);
    tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
    return tmp.buffer;
};