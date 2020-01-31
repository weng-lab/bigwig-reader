import { DataLoader } from "./DataLoader";
import { Readable } from "stream";
import { createReadStream } from "fs";

/**
 * DataLoader for loading binary data from an uploaded file.
 */
export class FileDataLoader implements DataLoader {

    constructor(private file: File) {}

    async load(start: number, size?: number): Promise<ArrayBuffer> {
	    return (await new Response(this.file.slice(start, size && start + size))).arrayBuffer();
    }

    async loadStream(start: number, size?: number): Promise<Readable> {
        return createReadStream(this.file.name, { start, end: size && start + size });
    }
}