# BigWig Reader
A Typescript library for reading BigWig, BigBed, 2bit, and Bam files. Capable of streaming.
For use in the browser or on Node.js.

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

### Reading BigWig / BigBed data
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

To stream "Big" data, just use the stream versions of these functions. For example:

```typescript
// Stream unzoomed wig data
const wigDataStream: Readable = await reader.streamBigWigData("chr14", 19_485_000, "chr14", 20_000_100);

// log bigwig data point objects as they are read in
seqStream.on("data", (wigData: BigWigData) => console.log(wigData));
```

### Reading 2bit data

To read 2bit file data do
```typescript
// Get sequence data from 2bit file for chr1:100000-200000
const sequence: string = await reader.readTwoBitData("chr1", 100_000, 200_000);
```

To stream the same data do
```typescript
// Get a readable stream of sequence data
const seqStream: Readable = await reader.streamTwoBitData("chr1", 100_000, 200_000, 1024 /* Optional chunk size */);

// log sequence as it is read
seqStream.on("data", (chunk: string) => console.log(chunk));
```

### Reading BAM data
Currently, only indexed reads using bai indexes are supported.

Unlike "big" file indexes, the entire bam index needs to be read to be useful, so the 
BamReader will read and cache the entire index on the first read.

The BAM header is also automatically read and cached with the reader.

```typescript
// Create data loaders for bam and index
const bamLoader = new AxiosDataLoader("http://localhost/sample.bam");
const bamIndexLoader = new AxiosDataLoader("http://localhost/sample.bam.bai");

const reader = new BamReader(bamLoader, bamIndexLoader);
// First read will load entire index and bam header into memory.
const alignments: BamAlignment[] = await reader.read("chr22", 20_000_000, 20_010_000);
// Subsequent reads will use cached index and header.
const otherAlignments: BamAlignment[] = await reader.read("chr22", 20_010_000, 20_020_000);

// This will fetch the parsed index. Uses cache.
const bamIndex: BamIndexData = await reader.getIndexData();
// This will fetch the parsed header. Uses cache.
const bamHeader: BamHeader = await reader.getHeaderData();
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