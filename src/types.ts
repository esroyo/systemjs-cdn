export interface HttpZParam {
    name: string;
    value?: string;
}

export interface HttpZBodyParam {
    type?: 'inline' | 'attachment';
    contentType?: string;
    name: string;
    fileName?: string;
}

export interface HttpZBody {
    contentType: string;
    boundary: string;
    params: HttpZParam[] | HttpZBodyParam[];
    text: string;
}

export interface HttpZResponseModel {
    protocolVersion: string;
    statusCode: number;
    statusMessage?: string;
    headers?: Record<string, string>;
    cookies?: HttpZParam[];
    body: HttpZBody;
    headersSize: number;
    bodySize: number;
}

export type ResponseProps = {
    url: string;
    body: string;
    ctime?: number;
    headers: Headers;
    status: number;
    statusText: string;
};
