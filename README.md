# Typescript BigWig Reader
A Typescript library for reading BigWig and BigBed files. Heavily influenced by [igv.js](https://github.com/igvteam/igv.js). For use in the browser or on Node.js.

Brought to you by UMass Medical School, Weng Lab.

## To use
```typescript
    // Create a loader. AxiosDataLoader handles loading data ranges for http requests.
    // Provide your own instance of Axios to add your own configurations.
    // Create your own implementation of DataLoader for loading data other ways, 
    // ie. from file system, ftp, cloud storage, etc...
    const loader = new AxiosDataLoader("http://localhost/sample.bigwig", Axios.create());

    // Create an instance of BigWigReader.
    const reader = new BigWigReader(loader);

    // Get file header data
    const header: HeaderData = await reader.getHeader();
    
    // Get unzoomed wig data (from BigWig files)
    const wigData: BigWigData[] = await reader.readBigWigData("chr14", 19_485_000, "chr14", 20_000_100);

    // Get unzoomed bed data (from BigBed files)
    const bedData: BigBedData[] = await reader.readBigBedData("chr21", 10_000_000, "chr21", 20_000_000);

    // Get zoom data (from BigWig or BigBed files)
    const zoomData: BigZoomData[] = await reader.readZoomData("chr2", 0, "chr6", 1000, 9);
```

## For contributers

### Building
* Run `yarn install` to install dependencies.
* Run `yarn build` to build.

### Testing
You must have Node.js and docker-compose installed. 
* `scripts/test.sh` to run automated tests.
* `scripts/run-dependencies.sh` to stand up a web server to host static sample BigWig and BigBed files. `scripts/test.sh` runs this for you.
* `scripts/stop-dependencies.sh` to stop bring down the server.