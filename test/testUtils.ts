import { Readable } from "stream";

export function streamToArray<T> (stream: Readable): Promise<T[]> {
    const chunks: T[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(chunks));
    });
  }