import axios from 'axios'
import * as Provider from '../provider'
import type { Storage } from '../storage'

/**
 * Upload adapter — the multipart file-upload primitive (full-shell plan P2;
 * approved). core-v3's generic `makeApiRequest` can't do multipart + upload
 * progress, so this uses axios directly with `FormData` + `onUploadProgress`.
 * Runs in the browser (where v2/v3 upload), so `FormData` is the platform
 * global. Returns the raw response body `{ status, results: { file: { url } } }`.
 */

export interface UploadResponse {
  status: number
  results: {
    file: {
      url: string
      name?: string
      size?: number
      pages?: number
      [k: string]: any
    }
  }
}

export interface UploadProgress {
  loaded: number
  total: number
}

export type UploadAdapter = ReturnType<typeof getUploadAdapter>

export const getUploadAdapter = (s: Storage) => ({
  upload(
    file: any,
    opts?: { onProgress?: (progress: UploadProgress) => void; url?: string }
  ): Promise<UploadResponse> {
    // `url` override lets v2 honor its customizable `uploadURL`; default is the
    // same `.../api/v2/sdk/upload` endpoint.
    const url = opts?.url ?? `${s.getBaseUrl()}/api/v2/sdk/upload`
    const formData = new FormData()
    formData.append('file', file)
    return axios
      .post<UploadResponse>(url, formData, {
        headers: Provider.withCredentials(s).headers,
        onUploadProgress: (e: { loaded?: number; total?: number }) => {
          if (opts?.onProgress) opts.onProgress({ loaded: e.loaded ?? 0, total: e.total ?? 0 })
        },
      })
      .then((resp) => resp.data)
  },
})

export default getUploadAdapter
