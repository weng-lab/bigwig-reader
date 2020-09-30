export interface BigBedDataNarrowPeak {
    chr: string,
    start: number,
    end: number,
    name?: string,
    score?: number,
    // + or - or . for unknown
    strand?: string,
    // Measurement of average enrichment for the region
    signalValue?: number,
    // Statistical significance of signal value (-log10). Set to -1 if not used
    pValue?: number,
    // Statistical significance with multiple-test correction applied (FDR -log10). Set to -1 if not used
    qValue?: number,
    // Point-source called for this peak; 0-based offset from chromStart. Set to -1 if no point-source called
    peak?: number,
}

export interface BigBedDataBroadPeak {
    chr: string,
    start: number,
    end: number,
    name?: string,
    score?: number,
    // + or - or . for unknown
    strand?: string,
    // Measurement of average enrichment for the region
    signalValue?: number,
    // Statistical significance of signal value (-log10). Set to -1 if not used
    pValue?: number,
    // Statistical significance with multiple-test correction applied (FDR -log10). Set to -1 if not used
    qValue?: number,
}

export interface BigBedDataMethyl {
    chr: string,
    start: number,
    end: number,
    name?: string,
    score?: number,
    strand?: string,     // + or - or . for unknown
    // Start of where display should be thick (start codon)
    thickStart?: number,
    // End of where display should be thick (stop codon)
    thickEnd?: number,
    // Color value R,G,B
    reserved?: number,
    // Number of reads or coverage
    readCount?: number,
    // Percentage of reads that show methylation at this position in the genome
    percentMeth?: number
}

export interface BigBedDataTssPeak {
    chr: string,
    start: number,
    end: number,
    name?: string,
    score?: number,
    // + or - or . for unknown
    strand?: string,
    // Count of reads mapping to this peak
    count?: number,
    // Gene identifier
    gene_id?: string,
    // Gene name
    gene_name?: string,
    // TSS identifier
    tss_id?: string,
    // base by base read coverage of the peak
    peak_cov?: string,
}

export interface BigBedDataIdrPeak {
    chr: string,
    start: number,
    end: number,
    name?: string,
    score?: number,
    // + or - or . for unknown
    strand?: string,
    // Local IDR value
    localIDR?: number,
    // Global IDR value
    globalIDR?: number,
    // Start position in chromosome of replicate 1 peak
    rep1_chromStart?: number,
    // End position in chromosome of replicate 1 peak
    rep1_chromEnd?: number,
    // Count (used for ranking) replicate 1
    rep1_count?: number,
    // Start position in chromosome of replicate 2 peak
    rep2_chromStart?: number,
    // End position in chromosome of replicate 2 peak
    rep2_chromEnd?: number,
    // Count (used for ranking) replicate 2
    rep2_count?: number,
}

export const parseBigBedNarrowPeak = function (chrom: string, startBase: number, endBase: number, rest: string) {
    const entry: BigBedDataNarrowPeak = {
        chr: chrom,
        start: startBase,
        end: endBase
    }

    let tokens = rest.split("\t");
    if (tokens.length > 0) {
        entry.name = tokens[0];
    }
    if (tokens.length > 1) {
        entry.score = parseFloat(tokens[1]);
    }
    if (tokens.length > 2) {
        entry.strand = tokens[2];
    }
    if (tokens.length > 3) {
        entry.signalValue = parseInt(tokens[3]);
    }
    if (tokens.length > 4) {
        entry.pValue = parseInt(tokens[4]);
    }
    if (tokens.length > 5) {
        entry.qValue = parseInt(tokens[5]);
    }
    if (tokens.length > 6) {
        entry.peak = parseInt(tokens[6]);
    }

    return entry;
}

export const parseBigBedBroadPeak = function (chrom: string, startBase: number, endBase: number, rest: string) {
    const entry: BigBedDataBroadPeak = {
        chr: chrom,
        start: startBase,
        end: endBase
    }

    let tokens = rest.split("\t");
    if (tokens.length > 0) {
        entry.name = tokens[0];
    }
    if (tokens.length > 1) {
        entry.score = parseFloat(tokens[1]);
    }
    if (tokens.length > 2) {
        entry.strand = tokens[2];
    }
    if (tokens.length > 3) {
        entry.signalValue = parseInt(tokens[3]);
    }
    if (tokens.length > 4) {
        entry.pValue = parseInt(tokens[4]);
    }
    if (tokens.length > 5) {
        entry.qValue = parseInt(tokens[5]);
    }

    return entry;
}

export const parseBigBedMethyl = function (chrom: string, startBase: number, endBase: number, rest: string) {
    const entry: BigBedDataMethyl = {
        chr: chrom,
        start: startBase,
        end: endBase
    }

    let tokens = rest.split("\t");
    if (tokens.length > 0) {
        entry.name = tokens[0];
    }
    if (tokens.length > 1) {
        entry.score = parseInt(tokens[1]);
    }
    if (tokens.length > 2) {
        entry.strand = tokens[2];
    }
    if (tokens.length > 3) {
        entry.thickStart = parseInt(tokens[3]);
    }
    if (tokens.length > 4) {
        entry.thickEnd = parseInt(tokens[4]);
    }
    if (tokens.length > 5) {
        entry.reserved = parseInt(tokens[5]);
    }
    if (tokens.length > 6) {
        entry.readCount = parseInt(tokens[6]);
    }
    if (tokens.length > 7) {
        entry.percentMeth = parseInt(tokens[7]);
    }

    return entry;
}

export const parseBigBedTssPeak = function (chrom: string, startBase: number, endBase: number, rest: string) {
    const entry: BigBedDataTssPeak = {
        chr: chrom,
        start: startBase,
        end: endBase
    }

    let tokens = rest.split("\t");
    if (tokens.length > 0) {
        entry.name = tokens[0];
    }
    if (tokens.length > 1) {
        entry.score = parseFloat(tokens[1]);
    }
    if (tokens.length > 2) {
        entry.strand = tokens[2];
    }
    if (tokens.length > 3) {
        entry.count = parseFloat(tokens[3]);
    }
    if (tokens.length > 4) {
        entry.gene_id = tokens[4];
    }
    if (tokens.length > 5) {
        entry.gene_name = tokens[5];
    }
    if (tokens.length > 6) {
        entry.tss_id = tokens[6];
    }
    if (tokens.length > 7) {
        entry.peak_cov = tokens[7];
    }


    return entry;
}

export const parseBigBedIdrPeak = function(chrom: string, startBase: number, endBase: number, rest: string) {
    const entry: BigBedDataIdrPeak = {
        chr: chrom,
        start: startBase,
        end: endBase
    }

    let tokens = rest.split("\t");
    if (tokens.length > 0) {
        entry.name = tokens[0];
    }
    if (tokens.length > 1) {
        entry.score = parseInt(tokens[1]);
    }
    if (tokens.length > 2) {
        entry.strand = tokens[2];
    }
    if (tokens.length > 3) {
        entry.localIDR = parseFloat(tokens[3]);
    }
    if (tokens.length > 4) {
        entry.globalIDR = parseFloat(tokens[4]);
    }
    if (tokens.length > 5) {
        entry.rep1_chromStart = parseInt(tokens[5]);
    }
    if (tokens.length > 6) {
        entry.rep1_chromEnd= parseInt(tokens[6]);
    }
    if (tokens.length > 7) {
        entry.rep1_count = parseFloat(tokens[7]);
    }
    if (tokens.length > 8) {
        entry.rep2_chromStart = parseInt(tokens[8]);
    }
    if (tokens.length > 9) {
        entry.rep2_chromEnd = parseInt(tokens[9]);
    }
    if (tokens.length > 10) {
        entry.rep2_chromEnd = parseFloat(tokens[10]);
    }

    return entry;
}
