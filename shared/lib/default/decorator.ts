export interface BaseRequest {
    auth?: string;
}

export interface BaseResponse<T> {
    success: boolean;
    data?: T | Record<string, any> | any[];
    message?: string;
}
