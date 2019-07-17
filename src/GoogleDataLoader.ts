import { Storage, Bucket, File } from '@google-cloud/storage';
import { DataLoader } from './DataLoader';

interface Result {
    done: boolean;
    value?: Uint8Array;
};

/**
 * DataLoader for reading data from a file in a GCP storage bucket.
 */
export class GoogleBucketDataLoader implements DataLoader {

    private storage_: Storage;
    private bucket_: Bucket;
    private file_: File;
    
    constructor(private bucket: string, private file: string, private billedProject?: string) {
	this.storage_ = new Storage();
	this.bucket_ = this.storage_.bucket(bucket);
	this.file_ = this.bucket_.file(file);
    }

    async load(start: number, size?: number): Promise<ArrayBuffer> {
	const bsize = size || (await this.file_.getMetadata({
	    userProject: this.billedProject
	}))[0].size - start;
	const stream = await this.file_.createReadStream({
	    userProject: this.billedProject,
	    start,
	    end: size ? start + size : start + bsize
	});
	const buffer: Uint8Array = new Uint8Array(bsize);
	let ptr: number = 0;
	let result: Result = { done: false };
	do {
	    const result: Result = await stream.read();
	    if (result.value !== undefined) {
		buffer.set(result.value, ptr);
		ptr += result.value.length;
	    } else
		throw new Error("could not read " + size + " bytes from gs://" + this.bucket + "/" + this.file);
	} while (!result.done);
	return buffer.buffer as ArrayBuffer;
    }
    
}
