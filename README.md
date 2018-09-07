# BigWig Reader
A Typescript library for reading BigWig and BigBed files. Heavily influenced by [igv.js](https://github.com/igvteam/igv.js). For use in the browser or on Node.js.

Brought to you by UMass Medical School, Weng Lab.

## Installation

For npm use: `npm install bigwig-reader --save`

For yarn use: `yarn add bigwig-reader`

## Usage

### Importing
```typescript
import { AxiosDataLoader, BigWigReader } from "bigwig-reader";
```

### Creating readers
You will need to create a `DataLoader` and `BigWigReader` for each file you want to read. DataLoaders handle IO. Readers are top level objects that read and parse data.

`AxiosDataLoader` is a provided `DataLoader` that handles loading data ranges for http requests. It's constructor allows you to optionally provide your own instance of Axios to add your own configurations. For example, if you want to add your own custom auth headers.

Create your own implementation of DataLoader for loading data other ways, 
ie. from file system, ftp, cloud storage, etc...
```typescript
const loader = new AxiosDataLoader("http://localhost/sample.bigwig", /* Optional */ Axios.create());
const reader = new BigWigReader(loader);
```

### Reading data
To read file header data do
```typescript
const header: HeaderData = await reader.getHeader();
```

To read data we have the following three functions. All read functions take the following arguments: `startChromosome`, `startBasePair`, `endChromosome`, `endBasePair`.
```typescript
// Get unzoomed wig data (from BigWig files)
const wigData: BigWigData[] = await reader.readBigWigData("chr14", 19_485_000, "chr14", 20_000_100);

// Get unzoomed bed data (from BigBed files)
const bedData: BigBedData[] = await reader.readBigBedData("chr21", 10_000_000, "chr21", 20_000_000);

// Get zoom data (from BigWig or BigBed files)
// You can find Zoom Level Index in HeaderData.zoomLevelHeaders.index
const zoomData: BigZoomData[] = await reader.readZoomData("chr2", 0, "chr6", 1000, /* Zoom Level Index */ 9);
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