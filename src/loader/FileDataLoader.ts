import { DataLoader } from "./DataLoader";

/**
 * DataLoader for loading binary data from an uploaded file.
 */
export class FileDataLoader implements DataLoader {

    constructor(private file: File) {}

    async load(start: number, size?: number): Promise<ArrayBuffer> {
	    return (await new Response(this.file.slice(start, size && start + size))).arrayBuffer();
    }
}