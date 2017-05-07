interface TinyQueue<T> {
    push(el: T): void;
    pop(): T;
    peek(): T;
    length: number;
}

type QueueComparator<T> = (a: T, b: T) => number;

declare module "tinyqueue" {
    type TinyQueueStatic = {
        new<T>(): TinyQueue<T>;
        new<T>(el: T[]): TinyQueue<T>;
        new<T>(el: T[], comp: QueueComparator<T>): TinyQueue<T>;
    }
    const tinyqueue: TinyQueueStatic;
    export = tinyqueue;
}