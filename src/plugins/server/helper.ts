import { RxServer } from './rx-server';
import type {
    Request,
    Response,
    NextFunction
} from 'express';
import { RxServerAuthData, RxServerEndpoint } from './types';
import {
    FilledMangoQuery,
    MangoQuerySelector,
    RxDocumentData,
    RxReplicationWriteToMasterRow,
    flatClone,
    getQueryMatcher,
    normalizeMangoQuery,
    uniqueArray
} from 'rxdb/plugins/core';

/**
 * "block" the previous version urls and send a 426 on them so that
 * the clients know they must update.
 */
export function blockPreviousVersionPaths(
    server: RxServer<any>,
    path: string,
    currentVersion: number

) {
    let v = 0;
    while (v < currentVersion) {
        const version = v;
        server.expressApp.all('/' + path + '/' + version + '/*', (req, res) => {
            closeConnection(res, 426, 'Outdated version ' + version + ' (newest is ' + currentVersion + ')');
        });
        v++;
    }
}


export async function closeConnection(response: Response, code: number, message: string) {
    const responseWrite = {
        code,
        error: true,
        message
    };
    response.statusCode = code;
    response.set("Connection", "close");
    await response.write(JSON.stringify(responseWrite));
    response.end();
}


export function addAuthMiddleware<AuthType>(
    server: RxServer<AuthType>,
    path: string,
): WeakMap<Request, RxServerAuthData<AuthType>> {
    const authDataByRequest = new WeakMap<Request, RxServerAuthData<AuthType>>();
    async function auth(req: Request, res: Response, next: NextFunction) {
        try {
            const authData = await server.authHandler(req.headers);
            authDataByRequest.set(req, authData);
            next();
        } catch (err) {
            closeConnection(res, 401, 'Unauthorized');
            return;
        }
    }
    server.expressApp.all('/' + path + '/*', auth, function (req, res, next) {
        next();
    });
    return authDataByRequest;
}

const defaultMatchingQuery: FilledMangoQuery<any> = {
    selector: {},
    skip: 0,
    sort: []
} as const;

export function getDocAllowedMatcher<RxDocType, AuthType>(
    endpoint: RxServerEndpoint<AuthType, RxDocType>,
    authData: RxServerAuthData<AuthType>
) {
    const useQuery: FilledMangoQuery<RxDocType> = endpoint.queryModifier ? endpoint.queryModifier(
        authData,
        normalizeMangoQuery(
            endpoint.collection.schema.jsonSchema,
            {}
        )
    ) : defaultMatchingQuery;
    const docDataMatcher = getQueryMatcher(endpoint.collection.schema.jsonSchema, useQuery);
    return docDataMatcher;
}

export function writeSSEHeaders(res: Response) {
    res.writeHead(200, {
        /**
         * Use exact these headers to make is less likely
         * for people to have problems.
         * @link https://www.youtube.com/watch?v=0PcMuYGJPzM
         */
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        /**
         * Required for nginx
         * @link https://stackoverflow.com/q/61029079/3443137
         */
        'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
}

export function docContainsServerOnlyFields(
    serverOnlyFields: string[],
    doc: any
) {
    const has = serverOnlyFields.find(field => {
        return typeof doc[field] !== 'undefined'
    });
    return has;
}

export function removeServerOnlyFieldsMonad<RxDocType>(serverOnlyFields: string[]) {
    const serverOnlyFieldsStencil: any = {
        _meta: undefined,
        _rev: undefined,
        _attachments: undefined
    };
    serverOnlyFields.forEach(field => serverOnlyFieldsStencil[field] = undefined);
    return (
        docData?: RxDocType | RxDocumentData<RxDocType>
    ) => {
        if (!docData) {
            return docData;
        }
        return Object.assign({}, docData, serverOnlyFieldsStencil);
    }
}

export function mergeServerDocumentFieldsMonad<RxDocType>(serverOnlyFields: string[]) {
    let useFields = serverOnlyFields.slice(0);
    // useFields.push('_rev');
    // useFields.push('_meta');
    // useFields.push('_attachments');
    useFields = uniqueArray(useFields);

    return (
        clientDoc: RxDocType | RxDocumentData<RxDocType>,
        serverDoc?: RxDocType | RxDocumentData<RxDocType>
    ) => {
        if (!serverDoc) {
            return clientDoc;
        }
        const ret = flatClone(clientDoc);
        useFields.forEach(field => {
            (ret as any)[field] = (serverDoc as any)[field];
        });
        return ret;
    }
}


/**
 * $regex queries are dangerous because they can dos-attach the 
 * 
 * @param selector 
 */
export function doesContainRegexQuerySelector(selector: MangoQuerySelector<any> | any): boolean {
    if (!selector) {
        return false;
    }
    if (Array.isArray(selector)) {
        const found = !!selector.find(item => doesContainRegexQuerySelector(item));
        return found;
    }

    if (typeof selector !== 'object') {
        return false;
    }

    const entries = Object.entries(selector);
    for (const [key, value] of entries) {
        if (key === '$regex') {
            return true;
        } else {
            const has = doesContainRegexQuerySelector(value);
            if (has) {
                return true;
            }
        }
    }

    return false;
}
