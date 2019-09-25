import { atom, Derivable } from "derivable";
import { IQHttpAdapter } from "./http";
import getSyncAdapter from "./sync";
import {
  Callback,
  IQMessage,
  IQRoom,
  Subscription,
  IQMessageAdapter,
  IQRoomAdapter,
  IQMessageType
} from "../defs";
import xs from "xstream";
import getMqttAdapter, { IQMqttAdapter } from "./mqtt";
import { tap, subscribeOnNext } from "../utils/stream";
import { QMessage } from "./message";

export interface IQRealtimeAdapter {
  onNewMessage(callback: Callback<IQMessage>): Subscription;
  onMessageDelivered(callback: Callback<IQMessage>): Subscription;
  onMessageRead(callback: Callback<IQMessage>): Subscription;
  onMessageDeleted(callback: Callback<IQMessage>): Subscription;
  onRoomCleared(callback: Callback<number>): Subscription;
  onTyping(
    callback: (userId: string, roomId: number, isTyping: boolean) => void
  ): Subscription;
  onPresence(callback: Callback<any>): Subscription;
  synchronize(lastMessageId: number): void;
  synchronizeEvent(lastEventId: number): void;
  sendTyping(roomId: number, userId: string, isTyping: boolean): void;
  sendPresence(userId: string, isOnline: boolean): void;
  readonly mqtt: IQMqttAdapter;
}

export type SyncMethod<T extends any[]> = (
  callback: (...data: T) => void
) => Subscription;
function fromSync<T extends any[]>(method: SyncMethod<T>) {
  let subscription: Subscription = null;
  return xs.create<T>({
    start(listener) {
      subscription = method((...data) => {
        listener.next([...data] as T);
      });
    },
    stop() {
      subscription();
    }
  });
}

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
      const subscription = xs
        .merge(fromSync(sync.onMessageDeleted), fromSync(mqtt.onMessageDeleted))
        .compose(subscribeOnNext(([message]) => callback(message)));
      return () => subscription.unsubscribe();
    },
    onMessageDelivered(callback: Callback<IQMessage>): Subscription {
      const subscription = xs
        .merge(
          fromSync(sync.onMessageDelivered),
          fromSync(mqtt.onMessageDelivered)
        )
        .compose(
          subscribeOnNext(([roomId, userId, messageId, messageUniqueId]) => {
            const message = QMessage.prepareNew(
              userId,
              roomId,
              null,
              IQMessageType.Text,
              null,
              null
            );
            message.id = messageId;
            message.uniqueId = messageUniqueId;
            callback(message);
          })
        );
      return () => subscription.unsubscribe();
    },
    onMessageRead(callback: Callback<IQMessage>): Subscription {
      const subscription = xs
        .merge(fromSync(sync.onMessageRead), fromSync(mqtt.onMessageRead))
        .compose(
          subscribeOnNext(([roomId, userId, messageId, messageUniqueId]) => {
            const message = QMessage.prepareNew(
              userId,
              roomId,
              null,
              IQMessageType.Text,
              null,
              null
            );
            message.id = messageId;
            message.uniqueId = messageUniqueId;
            callback(message);
          })
        );
      return () => subscription.unsubscribe();
    },
    onNewMessage(callback: Callback<IQMessage>): Subscription {
      const subscription = xs
        .merge(fromSync(sync.onNewMessage), fromSync(mqtt.onNewMessage))
        .compose(
          tap(([message]) => {
            messageAdapter
              .get()
              .markAsDelivered(message.roomId, message.id)
              .catch(_ => {});
          })
        )
        .compose(subscribeOnNext(([message]) => callback(message)));
      return () => subscription.unsubscribe();
    },
    onPresence(
      callback: (userId: string, isOnline: boolean, lastSeen: Date) => void
    ): Subscription {
      const subscription = fromSync(mqtt.onUserPresence).compose(
        subscribeOnNext(([userId, isOnline, lastSeen]) =>
          callback(userId, isOnline, lastSeen)
        )
      );
      return () => subscription.unsubscribe();
    },
    onRoomCleared(callback: Callback<number>): Subscription {
      const subscription = fromSync(sync.onRoomCleared).compose(
        subscribeOnNext(([room]) => callback(room.id))
      );
      return () => subscription.unsubscribe();
    },
    onTyping(
      callback: (userId: string, roomId: number, isTyping: boolean) => void
    ): Subscription {
      const subscription = fromSync(mqtt.onUserTyping).compose(
        subscribeOnNext(([userId, roomId, isTyping]) =>
          callback(userId, roomId, isTyping)
        )
      );
      return () => subscription.unsubscribe();
    },
    sendPresence(userId: string, isOnline: boolean): void {
      mqtt.sendPresence(userId, isOnline);
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
