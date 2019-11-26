interface IUrlBuilder {
  param(key: string, value: any): IUrlBuilder;
  build(): string;
}

export default function UrlBuilder(basePath: string): IUrlBuilder {
  const params: Record<string, any> = {};
  const getQuery = (key: string, value: string) => `${key}=${value}`;

  return {
    param(key, value) {
      params[key] = value;
      return this;
    },
    build() {
      const query = Object.keys(params)
        .filter((key) => params[key] != null)
        .map((key) => {
          if (Array.isArray(params[key])) {
            return params[key]
              .map((value: string) => getQuery(`${key}[]`, value))
              .join("&");
          }
          return getQuery(key, params[key]);
        })
        .join("&");
      return [basePath].concat(query).join("?");
    },
  };
}
