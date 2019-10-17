export enum Hooks {
  MESSAGE_BEFORE_SENT = "message::before-sent",
  MESSAGE_BEFORE_RECEIVED = "message::before-received",
}

interface Payload {}
interface Updater<T = Payload> {
  (payload: T): T | Promise<T>;
}
interface Subscription {
  (): void;
}

export type IMessage = Payload &
  Partial<{
    id: number;
    before_id: number;
    message: string;
    username_as: string;
    username_real: string;
    date: string;
    time: string;
    timestamp: Date;
    unique_id: string;
    avatar: string;
    room_id: number;
    isChannel: boolean;
    unix_timestamp: number;
    is_deleted: boolean;
    isPending: boolean;
    isFailed: boolean;
    isDelivered: boolean;
    isRead: boolean;
    isSent: boolean;
    attachment: boolean;
    payload: object;
    status: string;
  }>;

export function hookAdapterFactory<T = Payload>() {
  const hooks: { [key: string]: Updater<T>[] } = {};

  const get = (key: Hooks) => {
    if (!Array.isArray(hooks[key])) hooks[key] = [];
    return hooks[key];
  };

  function intercept(
    hook: Hooks.MESSAGE_BEFORE_RECEIVED,
    callback: Updater<IMessage>
  ): Subscription;
  function intercept(
    hook: Hooks.MESSAGE_BEFORE_SENT,
    callback: Updater<IMessage>
  ): Subscription;
  function intercept(hook: Hooks, callback: Updater<any>): Subscription {
    get(hook).push(callback);

    const index = get(hook).length;
    return () => get(hook).splice(index, 1);
  }

  function trigger(
    hook: Hooks.MESSAGE_BEFORE_SENT,
    payload: IMessage
  ): Promise<IMessage>;
  function trigger(
    hook: Hooks.MESSAGE_BEFORE_SENT,
    payload: IMessage
  ): Promise<IMessage>;
  function trigger(hook: Hooks, payload: any): Promise<any> {
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
