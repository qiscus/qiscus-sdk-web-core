
export default function UrlBuilder(basePath) {
  const params = {};
  const getQuery = (key, value) => `${key}=${value}`;

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
              .map((value) => getQuery(`${key}[]`, value))
              .join("&");
          }
          return getQuery(key, params[key]);
        })
        .join("&");
      return [basePath].concat(query).join("?");
    },
  };
}
