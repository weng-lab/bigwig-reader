/**
 * Utility class for reading useful primitive typed data from binary data.
 */
export class BinaryParser {
    
    private view: DataView;
    public position: number;
    private length: number;

    constructor(data: ArrayBuffer, private readonly littleEndian: boolean = true) {
        this.view = new DataView(data);
        this.position = 0;
        this.length = this.view.byteLength;
    }

    remLength() {
        return this.length - this.position;
    }

    private getValue(readFunc: (pos:number, littleEndian:boolean) => number, positionIncrement: number): number {
        let retValue = readFunc(this.position, this.littleEndian);
        this.position += positionIncrement;
        return retValue;
    }

    getByte(): number {
        return this.getValue((p:number) => this.view.getUint8(p), 1);
    }

    getShort(): number {
        return this.getValue((p:number, le:boolean) => this.view.getInt16(p, le), 2);
    }

    getUShort(): number {
        return this.getValue((p:number, le:boolean) => this.view.getUint16(p, le), 2);
    }

    getInt(): number {
        return this.getValue((p:number, le:boolean) => this.view.getInt32(p, le), 4);
    }

    getUInt() {
        return this.getValue((p:number, le:boolean) => this.view.getUint32(p, le), 4);
    }

    getFloat() {
        return this.getValue((p:number, le:boolean) => this.view.getFloat32(p, le), 4);
    }

    getDouble() {
        return this.getValue((p:number, le:boolean) => this.view.getFloat64(p, le), 8);
    }

    getLong() {
        // DataView doesn't support long. So we'll try manually
        let b: Array<number> = [];
        for (let i = 0; i < 8; i++) {
            b[i] = this.view.getUint8(this.position + i);
        }

        let value = 0;
        if (this.littleEndian) {
            for (let i = b.length - 1; i >= 0; i--) {
                value = (value * 256) + b[i];
            }
        } else {
            for (let i = 0; i < b.length; i++) {
                value = (value * 256) + b[i];
            }
        }

        this.position += 8;
        return value;
    }

    getString(len?: number) {
        let s = "", c: number;
        while ((c = this.view.getUint8(this.position++)) != 0) {
            s += String.fromCharCode(c);
            if (len && s.length == len) break;
        }
        return s;
    }

    getFixedLengthString(len: number) {
        let s = "";
        for (let i = 0; i < len; i++) {
            let c = this.view.getUint8(this.position++);
            if (c > 0) {
                s += String.fromCharCode(c);
            }
        }
        return s;
    }

    getFixedLengthTrimmedString(len: number) {
        let s = "";
        for (let i = 0; i < len; i++) {
            let c = this.view.getUint8(this.position++);
            if (c > 32) {
                s += String.fromCharCode(c);
            }
        }
        return s;
    }

}