import axios from "axios";
import it from "param.macro";
import { Derivable } from "derivable";

export interface IQHttpAdapter {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, data?: object): Promise<T>;
  postFormData<T>(path: string, form: FormData): Promise<T>;
  patch<T>(path: string, data?: object): Promise<T>;
  put<T>(path: string, data?: object): Promise<T>;
  delete<T>(path: string, data?: object): Promise<T>;
  upload<T>(
    path: string,
    data: object,
    progressCallback: (progress: number) => void
  ): Promise<T>;
}

export type Params = {
  baseUrl: string;
  httpHeader: Derivable<{ [key: string]: string }>;
  getAppId: () => string;
  getUserId: () => string;
  getToken: () => string;
  getSdkVersion: () => string;
};
export default function getHttpAdapter({
  baseUrl,
  httpHeader,
  getAppId,
  getUserId,
  getToken,
  getSdkVersion
}: Params): IQHttpAdapter {
  const api = axios.create({
    baseURL: baseUrl
  });
  api.interceptors.request.use(req => {
    const headers = {
      // "qiscus-sdk-app-id": getAppId(),
      // "qiscus-sdk-user-id": getUserId(),
      // "qiscus-sdk-token": getToken(),
      // "qiscus-sdk-version": getSdkVersion(),
      // "qiscus-sdk-platform": "JavaScript",
      qiscus_sdk_app_id: getAppId(),
      qiscus_sdk_user_id: getUserId(),
      qiscus_sdk_token: getToken(),
      qiscus_sdk_version: getSdkVersion(),
      qiscus_sdk_platform: "JavaScript"
    };
    const additionalHeaders = httpHeader.get();
    if (additionalHeaders != null) {
      Object.keys(additionalHeaders).forEach(key => {
        headers[key] = additionalHeaders[key];
      });
    }
    Object.assign(req.headers, headers);
    return req;
  });

  return {
    delete<T>(path: string, data?: object): Promise<T> {
      return api
        .delete(path, {
          data
        })
        .then(it.data);
    },
    get<T>(path: string): Promise<T> {
      return api.get<T>(path).then(it.data);
    },
    patch<T>(path: string, data?: object): Promise<T> {
      return api.patch<T>(path, data).then(it.data);
    },
    post<T>(path: string, data?: object): Promise<T> {
      return api.post<T>(path, data).then(it.data);
    },
    postFormData<T>(path: string, form: FormData): Promise<T> {
      return api.post<T>(path, form).then(it.data);
    },
    put<T>(path: string, data?: object): Promise<T> {
      return api.put<T>(path, data).then(it.data);
    },
    upload<T>(
      path: string,
      data: object,
      progressCallback: (progress: number) => void
    ): Promise<T> {
      return api
        .post<T>(path, data, {
          onUploadProgress(progress: ProgressEvent) {
            const percentage = (progress.loaded / progress.total) * 100;
            progressCallback(percentage);
          }
        })
        .then(it.data);
    }
  };
}
