interface IQUrlBuilder {
  param(key: string, value: any): IQUrlBuilder
  build(): string
}

export default function QUrlBuilder(basePath: string): IQUrlBuilder {
  const params: Record<string, string[] | string> = {}

  const getQuery = (key: string, value: string) => `${key}=${value}`

  return {
    param(key: string, value: any): IQUrlBuilder {
      params[key] = value
      return this
    },
    build(): string {
      const query = Object.keys(params)
        .filter(key => params[key] != null)
        .map(key => {
          if (Array.isArray(params[key])) {
            return (params[key] as string[])
              .map(value => getQuery(`${key}[]`, value))
              .join('&')
          }
          return getQuery(key, params[key] as string)
        })
        .join('&')

      return [basePath].concat(query).join('?')
    },
  }
}
