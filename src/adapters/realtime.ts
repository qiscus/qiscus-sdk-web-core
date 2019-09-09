import {IQHttpAdapter} from './http';
import getSyncAdapter from './sync';
import {IQMessage, IQRoom} from '../defs';
import xs from 'xstream';
import getMqttAdapter, {IQMqttAdapter} from './mqtt';
import {subscribeOnNext} from '../utils/stream';

type Callback<T> = (data: T) => void
type Subscription = () => void

export interface IQRealtimeAdapter {
  onNewMessage(callback: Callback<IQMessage>): Subscription
  onMessageDelivered(callback: Callback<IQMessage>): Subscription
  onMessageRead(callback: Callback<IQMessage>): Subscription
  onMessageDeleted(callback: Callback<IQMessage>): Subscription
  onRoomCleared(callback: Callback<IQRoom>): Subscription
  onTyping(callback: Callback<boolean>): Subscription
  onPresence(callback: Callback<any>): Subscription
  synchronize(lastMessageId: number): void
  synchronizeEvent(lastEventId: number): void
  sendTyping(roomId: number, userId: string, isTyping: boolean): void
  sendPresence(userId: string): void
  readonly mqtt: IQMqttAdapter
}

type SyncMethod<T> = (callback: Callback<T>) => Subscription
const fromSync = <T>(method: SyncMethod<T>) => {
  let subscription: Subscription = null;
  return xs.create<T>({
    start(listener) {
      subscription = method((data) => {
        listener.next(data);
      });
    },
    stop() {
      subscription();
    }
  });
};

export default function getRealtimeAdapter(
  http: IQHttpAdapter,
  syncInterval: number,
  brokerUrl: string,
  shouldSync: boolean,
  isLogin: boolean,
  token: string
): IQRealtimeAdapter {
  let isMqttConnected = false;
  const sync = getSyncAdapter(http, token);
  const mqtt = getMqttAdapter(brokerUrl);

  xs.periodic(syncInterval)
    .filter(() => isLogin)
    .filter(() => isMqttConnected || shouldSync)
    .subscribe({
      next() {
        sync.synchronize();
        sync.synchronizeEvent();
      }
    });

  return {
    get mqtt() {
      return mqtt;
    },
    onMessageDeleted(callback: Callback<IQMessage>): Subscription {
      const subscription = xs.merge(
        fromSync(sync.onMessageDeleted),
        fromSync(mqtt.onMessageDeleted)
      ).compose(subscribeOnNext(callback));
      return () => subscription.unsubscribe();
    },
    onMessageDelivered(callback: Callback<IQMessage>): Subscription {
      const subscription = xs.merge(
        fromSync(sync.onMessageDelivered),
        fromSync(mqtt.onMessageDelivered)
      ).compose(subscribeOnNext(callback));
      return () => subscription.unsubscribe();
    },
    onMessageRead(callback: Callback<IQMessage>): Subscription {
      const subscription = xs.merge(
        fromSync(sync.onMessageRead),
        fromSync(mqtt.onMessageRead)
      ).compose(subscribeOnNext(callback));
      return () => subscription.unsubscribe();
    },
    onNewMessage(callback: Callback<IQMessage>): Subscription {
      const subscription = xs.merge(
        fromSync(sync.onNewMessage),
        fromSync(mqtt.onNewMessage)
      ).compose(subscribeOnNext(callback));
      return () => subscription.unsubscribe();
    },
    onPresence(callback: Callback<any>): Subscription {
      const subscription = fromSync(mqtt.onUserPresence)
        .compose(subscribeOnNext(callback));
      return () => subscription.unsubscribe();
    },
    onRoomCleared(callback: Callback<IQRoom>): Subscription {
      const subscription = fromSync(sync.onRoomCleared)
        .compose(subscribeOnNext(callback));
      return () => subscription.unsubscribe();
    },
    onTyping(callback: Callback<any>): Subscription {
      const subscription = fromSync(mqtt.onUserTyping)
        .compose(subscribeOnNext(callback));
      return () => subscription.unsubscribe();
    },
    sendPresence(userId: string): void {
      mqtt.sendPresence(userId);
    },
    sendTyping(roomId: number, userId: string, isTyping: boolean): void {
      mqtt.sendTyping(roomId, userId, isTyping);
    },
    synchronize(lastMessageId: number): void {
      sync.synchronize(lastMessageId);
    },
    synchronizeEvent(lastEventId: number): void {
      sync.synchronizeEvent(lastEventId);
    }
  };
}
