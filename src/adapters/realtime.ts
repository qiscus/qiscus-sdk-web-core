import {atom, Derivable} from 'derivable';
import {IQHttpAdapter} from './http';
import getSyncAdapter from './sync';
import {Callback, IQMessage, IQRoom, Subscription, IQMessageAdapter, IQRoomAdapter} from '../defs';
import xs from 'xstream';
import getMqttAdapter, {IQMqttAdapter} from './mqtt';
import {tap, subscribeOnNext} from '../utils/stream';

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
  http: Derivable<IQHttpAdapter>,
  messageAdapter: Derivable<IQMessageAdapter>,
  roomAdapter: Derivable<IQRoomAdapter>,
  syncInterval: Derivable<number>,
  brokerUrl: Derivable<string>,
  shouldSync: Derivable<boolean>,
  isLogin: Derivable<boolean>,
  token: Derivable<string>
): IQRealtimeAdapter {
  const isMqttConnected = atom(false);
  const sync = getSyncAdapter(http, messageAdapter, roomAdapter, token);
  const mqtt = getMqttAdapter(messageAdapter, brokerUrl);

  xs.periodic(syncInterval.get())
    .filter(() => isLogin.get())
    .filter(() => !isMqttConnected.get() || shouldSync.get())
    .subscribe({
      next() {
        sync.synchronize();
        sync.synchronizeEvent();
      }
    });

  mqtt.onMqttConnected(() => isMqttConnected.set(true));

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
      )
        .compose(tap((message) => {
          messageAdapter.get().markAsDelivered(message.roomId, message.id)
            .then((message) => console.log('success marking as delivered', message))
            .catch((err) => console.log('failed marking as delivered', err.message))
        }))
        .compose(subscribeOnNext(callback));
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
