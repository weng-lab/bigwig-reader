import { AxiosDataLoader, BufferedDataLoader } from "../src/DataLoader";
import Axios from "axios";
import { stat, open, read } from "fs";
import { promisify } from "util";
import * as path from "path";

async function fsRead(path: string, start: number, size: number): Promise<Uint8Array> {
    const fd: number = await promisify(open)(path, "r");
    const buffer = Buffer.alloc(size);
    await promisify(read)(fd, buffer, 0, size, start);
    return new Uint8Array(buffer);
}

const filename = "testbw.bigwig";
const url = `http://localhost:8001/${filename}`
const fsPath = path.join(__dirname, "..", "resources", "static", filename);

describe("AxiosDataLoader", () => {
    it("should return fileSize", async () => {
        const loader = new AxiosDataLoader(url, Axios.create());
        const fileSize = await loader.fileSize();
        const fsFileSize = (await promisify(stat)(fsPath)).size;
        expect(fileSize).toBe(fsFileSize);
    });

    it("should load the correct data", async () => {
        const readStart = 0, readSize = 64;
        const loader = new AxiosDataLoader(url, Axios.create());
        const data = new Uint8Array(await loader.load(readStart, readSize));
        const fsData = await fsRead(fsPath, readStart, readSize);
        expect(data.toString()).toBe(fsData.toString());
    });
});

describe("BufferedDataLoader", () => {
    it("should buffer data for subsequent calls", async () => {
        const loader = new AxiosDataLoader(url, Axios.create());
        const bufferedLoader = new BufferedDataLoader(loader, 250, await loader.fileSize());
        const loaderSpy = jest.spyOn(loader, "load");

        let readStart = 100, readSize = 100;
        let data = new Uint8Array(await bufferedLoader.load(readStart, readSize));
        let fsData = await fsRead(fsPath, readStart, readSize);
        expect(data.toString()).toBe(fsData.toString());
        expect(loaderSpy).toHaveBeenCalled();
        
        // This call should use buffered data. It should not need to call out to the loader.
        readStart = 200;
        data = new Uint8Array(await bufferedLoader.load(readStart, readSize));
        fsData = await fsRead(fsPath, readStart, readSize);
        expect(data.toString()).toBe(fsData.toString());
        expect(loaderSpy).toHaveBeenCalledTimes(1);

        // This call should request more data than the buffer contains. It should call out to the loader.
        readStart = 300;
        data = new Uint8Array(await bufferedLoader.load(readStart, readSize));
        fsData = await fsRead(fsPath, readStart, readSize);
        expect(data.toString()).toBe(fsData.toString());
        expect(loaderSpy).toHaveBeenCalledTimes(2);
    });
});