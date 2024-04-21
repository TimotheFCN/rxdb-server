import type {
    MaybePromise,
    ReplicationOptions,
    ReplicationPullOptions,
    ReplicationPushOptions,
    RxStorageDefaultCheckpoint
} from 'rxdb/plugins/core';

export type ServerSyncPullOptions<RxDocType> =
    Omit<ReplicationPullOptions<RxDocType, RxStorageDefaultCheckpoint>, 'handler' | 'stream$'>
    & {
    };

export type ServerSyncPushOptions<RxDocType> = Omit<ReplicationPushOptions<RxDocType>, 'handler'>
    & {
};

export type ServerSyncOptions<RxDocType> = Omit<
    ReplicationOptions<RxDocType, any>,
    'pull' | 'push'
> & {
    url: string;
    headers?: { [k: string]: string };
    pull?: ServerSyncPullOptions<RxDocType>;
    push?: ServerSyncPushOptions<RxDocType>;

    /**
     * If the EventSource API is not available
     * on the runtime, pass an own implementation here.
     * Mostly used with the "eventsource" npm package on Node.js.
     */
    eventSource?: typeof EventSource | any
};


export type RxServerCheckpoint = {
    id: string;
    lwt: number;
};
