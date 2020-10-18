# Genomic Reader
A Typescript library for reading BigWig, BigBed, 2bit, and Bam files. Capable of streaming.
For use in the browser or on Node.js.

Brought to you by UMass Medical School, Weng Lab.

## Installation

For npm use: `npm install bigwig-reader`

For yarn use: `yarn add bigwig-reader`

## Usage

### Importing
```typescript
import { AxiosDataLoader, BigWigReader } from "genomic-reader";
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

### Reading BigBed Variants

All BigBed files are assumed to follow the column-structure as defined by [UCSC Genome Browser](http://genome.ucsc.edu/goldenPath/help/bigBed.html). Nevertheless, there are many variants. Genomic Reader support these [ENCODE](https://www.encodeproject.org) variants of BigBed - [Broad Peak](https://github.com/ENCODE-DCC/encValData/blob/master/as/broadPeak.as), [Narrow Peak](https://github.com/ENCODE-DCC/encValData/blob/master/as/narrowPeak.as), [Methyl](https://github.com/ENCODE-DCC/encValData/blob/master/as/bedMethyl.as), [Tss Peak](https://github.com/ENCODE-DCC/encValData/blob/master/as/tss_peak.as), and [Idr Peak](https://github.com/ENCODE-DCC/encValData/blob/master/as/idr_peak.as).

Reading any of the supported [ENCODE](https://www.encodeproject.org) BigBed files is similar to the way described earlier for BigBed. However, the difference is that you provide a parse function. The parse function tells Genomic Reader how to interpret columns in the BigBed file.

The inbuilt parse functions are - parseBigBed ([UCSC Genome Browser](http://genome.ucsc.edu/goldenPath/help/bigBed.html)), parseBigBedBroadPeak ([Broad Peak](https://github.com/ENCODE-DCC/encValData/blob/master/as/broadPeak.as)), parseBigBedNarrowPeak ([Narrow Peak](https://github.com/ENCODE-DCC/encValData/blob/master/as/narrowPeak.as)), parseBigBedMethyl ([Methyl](https://github.com/ENCODE-DCC/encValData/blob/master/as/bedMethyl.as)), parseBigBedTssPeak ([Tss Peak](https://github.com/ENCODE-DCC/encValData/blob/master/as/tss_peak.as)) and parseBigBedIdrPeak ([Idr Peak](https://github.com/ENCODE-DCC/encValData/blob/master/as/idr_peak.as)). These have the same signature as the ParseFunction type (from Genomic Reader).

To begin, you pass the parse function as the fifth parameter. It defaults to parseBigBed if none is provided. For example, to read a [Broad Peak](https://github.com/ENCODE-DCC/encValData/blob/master/as/broadPeak.as) file you do:

```typescript
// Get unzoomed Broad Peak data (from BigBed files)
const  BigBedDataBroadPeak:  BigBedDataBroadPeak[] = await reader.readBigBedData("chr21", 10_000_000, "chr21", 20_000_000, parseBigBedBroadPeak);
```

The same ideas apply to stream BigBed data. For example, to stream [Broad Peak](https://github.com/ENCODE-DCC/encValData/blob/master/as/broadPeak.as) data you do -

```typescript
// Stream unzoomed Broad peak data (from BigBed files)
const bigBedDataCustomFormatStream: Readable = await streamBigBedData("chr14", 19_485_000, "chr14", 20_000_100, parseBigBedBroadPeak);
```

Genomic Reader does not validate the BigBed file to ensure the columns match up with the parse function. For example, if a BigBed file column contains '+' but number is "12" is provided, an exception may occur. It is the responsibility of the consuming application to ensure that the BigBed file is valid and that the appropiate parse functon is used.

### Creating Custom BigBed Formats
The parse functions provided should cover nearly all cases in practice. But in case you need a different parse function for an unsupported BigBed variant, you can create a custom parse function. You first create an interface that defines the BigBed column-structure and type. Next, you define a parse function that parses the BigBed defined by the interface. You then use the readBigBedData function as described earlier.

To illustrate, let say you have an unsupported BigBed format named - Custom format. It has columns defined as -
- chrom (chromosome)
- chromStart (start coordinate)
- chromEnd (end coordinate)
- name (name of the file), score (color tint)
- strand (DNA orientation, either ‘.’, ‘+’ or ‘-’)
- signalValue (Measurement of average enrichment for the region)

First you define the interface such as -

```typescript
export interface BigBedCustomFormat {
    chr: string,
    start: number,
    end: number,
    name?: string,
    score?: number,
    strand?: string,
    signalValue?: number,
}
```

Next, you define the parse function:

```typescript
export const parseBigBedCustomFormat = function (chrom: string, startBase: number, endBase: number, rest: string):  BigBedCustomFormat {
    const entry: BigBedCustomFormat = {
        chr: chrom, // first column- chr
        start: startBase, // second column- start
        end: endBase //third column- end
    }

    let tokens = rest.split("\t");
    if (tokens.length > 0) {
        entry.name = tokens[0]; // fourth column- name
    }
    if (tokens.length > 1) {
        entry.score = parseFloat(tokens[1]); // fifth column score
    }
    if (tokens.length > 2) {
        entry.strand = tokens[2]; //sixth column- strand
    }
    if (tokens.length > 3) {
        entry.signalValue = parseInt(tokens[3]); // seventh column- signalValue
    }

    return entry;
}
```

Now, you can read the file as a Custom format BigBed format by:

```typescript
// Get unzoomed Custom format BigBed data (from BigBed files)
const  BigBedDataCustomFormat:  BigBedDataCustomFormat[] = await reader.readBigBedData("chr21", 10_000_000, "chr21", 20_000_000, parseCustomFormat);
```

The same ideas above can use be used to stream BigBed data. You just add the parse function at the fifth parameter:

```typescript
const bigBedDataCustomFormatStream: Readable = await streamBigBedData("chr14", 19_485_000, "chr14", 20_000_100, parseCustomFormat);
```

Genomic Reader does not validate the Custom format BigBed file to ensure the columns match up with what the parse function expects. For example, if BigBed file column contains '+' for the start column (second column) but parse function expect a number like "66", an exception may occur. It is the responsibility of the consuming application to ensure there is no mismatch between the Custom format BigBed file and the parse function and that the BigBed file is valid.


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
You must have [Node.js](https://www.npmjs.com/get-npm) and [docker-compose](https://www.docker.com/products/docker-desktop) installed. 
* `scripts/test.sh` to run automated tests.
* `scripts/run-dependencies.sh` to stand up a web server to host static sample BigWig and BigBed files. `scripts/test.sh` runs this for you.
* `scripts/stop-dependencies.sh` to stop bring down the server.