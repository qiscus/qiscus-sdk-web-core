import ky from "ky-universal";
import { Derivable } from "derivable";

export interface IQHttpAdapter {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, data?: object): Promise<T>;
  postFormData<T>(path: string, form: FormData): Promise<T>;
  patch<T>(path: string, data?: object): Promise<T>;
  put<T>(path: string, data?: object): Promise<T>;
  delete<T>(path: string, data?: object): Promise<T>;
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
  const api = ky.create({
    prefixUrl: baseUrl,
    onDownloadProgress(progress, chunk) {
      console.log(
        "on:progress",
        progress.percent,
        progress.transferredBytes,
        progress.totalBytes
      );
    },
    hooks: {
      beforeRequest: [
        options => {
          const headers = options.headers as Headers;
          // @ts-ignore
          // headers.set("qiscus-sdk-app-id", getAppId());
          headers.set("qiscus_sdk_app_id", getAppId());
          // headers.set("qiscus-sdk-user-id", getUserId());
          headers.set("qiscus_sdk_user_id", getUserId());
          // headers.set("qiscus-sdk-token", getToken());
          headers.set("qiscus_sdk_token", getToken());
          // headers.set("qiscus-sdk-version", getSdkVersion());
          headers.set("qiscus_sdk_version", getSdkVersion());
          // headers.set("qiscus-sdk-platform", "JavaScript");
          headers.set("qiscus_sdk_platform", "JavaScript");

          // For custom header
          const customHeader = httpHeader.get();
          if (customHeader == null) return;
          Object.keys(customHeader).forEach(key => {
            headers.set(key, customHeader[key]);
          });
        }
      ]
    }
  });

  return {
    delete<T>(path: string, data?: object): Promise<T> {
      return api.delete(path, { json: data }).json<T>();
    },
    get<T>(path: string): Promise<T> {
      return api.get(path).json<T>();
    },
    patch<T>(path: string, data?: object): Promise<T> {
      return api.patch(path, { json: data }).json<T>();
    },
    post<T>(path: string, data?: object): Promise<T> {
      return api.post(path, { json: data }).json<T>();
    },
    postFormData<T>(path: string, form: FormData): Promise<T> {
      return api.post(path, { body: form }).json<T>();
    },
    put<T>(path: string, data?: object): Promise<T> {
      return api.post(path, { json: data }).json<T>();
    }
  };
}
