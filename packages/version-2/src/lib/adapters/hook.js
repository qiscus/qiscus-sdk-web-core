export const Hooks = {
  MESSAGE_BEFORE_SENT : "message::before-sent",
  MESSAGE_BEFORE_RECEIVED : "message::before-received",
}

export function hookAdapterFactory() {
  const hooks = {};

  const get = (key) => {
    if (!Array.isArray(hooks[key])) hooks[key] = [];
    return hooks[key];
  };

  function intercept(hook, callback) {
    get(hook).push(callback);

    const index = get(hook).length;
    return () => get(hook).splice(index, 1);
  }

  function trigger(hook, payload) {
    return get(hook).reduce(
      (acc, fn) => Promise.resolve(acc).then(fn),
      Promise.resolve(payload)
    );
  }

  return {
    trigger,
    intercept,
  };
}
