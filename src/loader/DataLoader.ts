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
 * Wrapper for other DataLoaders that buffers. Used internally by the BigWigReader.
 * This class does not implement DataLoader. It is not meant to be passed in in BigWigReader as the DataLoader you must provide.
 * 
 * When you initially request data, potentially much more (bufferSize) than you ask for is loaded into a buffer.
 * This buffer is checked first for subsequent requests.
 */
export class BufferedDataLoader {

    private buffer?: LoaderBuffer;

    constructor(private dataLoader: DataLoader, private bufferSize: number){}

    async load(start: number, size: number): Promise<ArrayBuffer> {
        // If the data is in the buffer, return it.
        const bufferedData = this.getDataFromBuffer(start, size);
        if (undefined !== bufferedData) {
            return bufferedData;
        }

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
            start: start,
            size: data.byteLength
        }

        if (size > data.byteLength) {
            throw new IOError(`Requested ${size} bytes but only got back ${this.buffer.size}`);
        }
        return this.buffer.data.slice(0, size);
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