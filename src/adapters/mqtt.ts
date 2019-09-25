import flatten from "lodash.flatten";
import { match, when } from "../utils/match";
import { EventEmitter } from "pietile-eventemitter";
import connect from "mqtt/lib/connect";
import { atom, Atom, Derivable } from "derivable";
import { IClientPublishOptions, MqttClient } from "mqtt";
import { IQMessageAdapter, Subscription, Callback, IQMessage } from "../defs";
import { QMessage } from "./message";

const reNewMessage = /^([\w]+)\/c/i;
const reNotification = /^([\w]+)\/n/i;
const reTyping = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/t$/i;
const reDelivery = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/d$/i;
const reRead = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/r$/i;
const reOnlineStatus = /^u\/([\S]+)\/s$/i;
const reChannelMessage = /^([\S]+)\/([\S]+)\/c/i;
const reCustomEvent = /^r\/[\w]+\/[\w]+\/e$/i;

export interface IQMqttAdapter {
  connect(userId: string): void;
  onMqttConnected(callback: () => void): Subscription;
  onMqttReconnecting(callback: () => void): Subscription;
  onMqttDisconnected(callback: () => void): Subscription;
  onNewMessage(callback: Callback<IQMessage>): Subscription;
  onMessageDelivered(callback: Callback<any>): Subscription;
  onMessageRead(callback: Callback<any>): Subscription;
  onUserTyping(
    callback: (userId: string, roomId: number, isTyping: boolean) => void
  ): Subscription;
  onUserPresence(
    callback: (userId: string, isOnline: boolean, lastSeen: Date) => void
  ): Subscription;
  onNewChannelMessage(callback: Callback<any>): Subscription;
  onMessageDeleted(callback: Callback<any>): Subscription;
  onRoomDeleted(callback: Callback<any>): Subscription;
  sendPresence(userId: string, isOnline: boolean): void;
  sendTyping(roomId: number, userId: string, isTyping: boolean): void;
  publishCustomEvent(roomId: number, userId: string, data: any): void;
  subscribeCustomEvent(roomId: number, callback: Callback<any>): void;
  unsubscribeCustomEvent(roomId: number): void;
  subscribeUser(userToken: string): Subscription;
  subscribeUserPresence(userId: string): void;
  unsubscribeUserPresence(userId: string): void;
  subscribeRoom(roomId: number): void;
  unsubscribeRoom(roomId: number): void;
  subscribeChannel(appId: string, channelUniqueId: string): void;
  unsubscribeChannel(appId: string, channelUniqueId: string): void;
  readonly mqtt: any;
}

export type MqttMessage = {
  id: number;
  comment_before_id: number;
  message: string;
  username: string;
  email: string;
  user_avatar: string;
  timestamp: Date;
  unix_timestamp: number;
  created_at: Date;
  room_id: number;
  room_name: string;
  topic_id: number;
  unique_temp_id: string;
  disable_link_preview: boolean;
  chat_type: string;
  comment_before_id_str: string;
  extras: object;
  is_public_channel: boolean;
  payload: object;
  raw_room_name: string;
  room_avatar: string;
  room_id_str: string;
  room_options: string;
  room_type: string;
  status: string;
  topic_id_str: string;
  type: string;
  unix_nano_timestamp: number;
  user_avatar_url: string;
  user_id: number;
  user_id_str: string;
};
export type MqttNotification = {
  id: number;
  timestamp: number;
  action_topic: string;
  payload: {
    actor: {
      id: string;
      email: string;
      name: string;
    };
    data: {
      deleted_messages: [
        {
          message_unique_ids: string[];
          room_id: string;
        }
      ];
      is_hard_delete: boolean;
      deleted_rooms: [
        {
          avatar_url: string;
          chat_type: string;
          id: number;
          id_str: string;
          options: object;
          raw_room_name: string;
          room_name: string;
          unique_id: string;
          last_comment: object;
        }
      ];
    };
  };
};
export type MqttMessageReceived = {
  message: MqttMessage;
};
export type MqttMessageDelivery = {
  roomId: number;
  userId: string;
  messageId: number;
  messageUniqueId: string;
};
export type MqttUserPresence = {
  userId: string;
  isOnline: boolean;
  lastSeen: Date;
};
export type MqttUserTyping = {
  isTyping: boolean;
  userId: string;
  roomId: number;
};
export type MqttCustomEvent = { roomId: number; payload: any };
interface Events {
  "message::received": (message: MqttMessageReceived) => void;
  "message::delivered": (message: MqttMessageDelivery) => void;
  "message::read": (message: MqttMessageDelivery) => void;
  "message::deleted": (data: { roomId: number; uniqueId: string }) => void;
  "room::cleared": (roomId: number) => void;
  "user::typing": (data: MqttUserTyping) => void;
  "user::presence": (data: MqttUserPresence) => void;
  "channel-message::new": (
    message: MqttMessageReceived & { channelUniqueId: string }
  ) => void;
  "custom-event": (payload: any) => void;
  "mqtt::connected": () => void;
  "mqtt::disconnected": () => void;
  "mqtt::reconnecting": () => void;
}
interface MQTTHandler {
  (topic: string): (data: any) => void;
}
interface IQMqttHandler {
  newMessage: MQTTHandler;
  notificationHandler: MQTTHandler;
  typingHandler: MQTTHandler;
  deliveredHandler: MQTTHandler;
  readHandler: MQTTHandler;
  onlineHandler: MQTTHandler;
  channelMessageHandler: MQTTHandler;
  customEventHandler: MQTTHandler;
}

const getMqttHandler = (emitter: EventEmitter<Events>): IQMqttHandler => {
  return {
    channelMessageHandler: topic => data => {
      const topicData = reChannelMessage.exec(topic);
      const channelUniqueId = topicData[2];
      const message = JSON.parse(data);
      emitter.emit("channel-message::new", { channelUniqueId, message });
    },
    customEventHandler: topic => data => {
      const topicData = reCustomEvent.exec(topic);
      const roomId = topicData[1];
      const payload = JSON.parse(data);
      emitter.emit("custom-event", { roomId, payload });
    },
    notificationHandler: _ => (data: string) => {
      const payload = JSON.parse(data) as MqttNotification;
      if (payload.action_topic === "delete_message") {
        const deletedMessagesData = payload.payload.data.deleted_messages;
        deletedMessagesData.forEach(data => {
          const roomId = parseInt(data.room_id, 10);
          data.message_unique_ids.forEach(uniqueId => {
            emitter.emit("message::deleted", { roomId, uniqueId });
          });
        });
      }
      if (payload.action_topic === "clear_room") {
        console.log("got another notification", data);
        const clearedRooms = payload.payload.data.deleted_rooms;
        clearedRooms.forEach(room => {
          const roomId = room.id;
          emitter.emit("room::cleared", roomId);
        });
      }
    },
    onlineHandler: topic => data => {
      const topicData = reOnlineStatus.exec(topic);
      const payload = data.split(":");
      const userId = topicData[1];
      const isOnline = Number(payload[0]) === 1;
      const lastSeen = new Date(Number(payload[1]));
      emitter.emit("user::presence", { userId, isOnline, lastSeen });
    },
    deliveredHandler: topic => data => {
      const topicData = reDelivery.exec(topic);
      const payload = data.split(":");
      const roomId = parseInt(topicData[1], 10);
      const userId = topicData[3];
      const messageId = payload[0];
      const messageUniqueId = payload[1];
      emitter.emit("message::delivered", {
        roomId,
        userId,
        messageId,
        messageUniqueId
      });
    },
    newMessage: _ => data => {
      const message: MqttMessage = JSON.parse(data);
      emitter.emit("message::received", { message });
    },
    readHandler: topic => data => {
      const topicData = reRead.exec(topic);
      const roomId = parseInt(topicData[1], 10);
      const userId = topicData[3];
      const payload = data.split(":");
      const messageId = payload[0];
      const messageUniqueId = payload[1];
      emitter.emit("message::read", {
        roomId,
        userId,
        messageId,
        messageUniqueId
      });
    },
    typingHandler: topic => data => {
      const topicData = reTyping.exec(topic);
      const roomId = parseInt(topicData[1], 10);
      const userId = topicData[3];
      const isTyping = Number(data) === 1;
      emitter.emit("user::typing", { roomId, userId, isTyping });
    }
  };
};

export default function getMqttAdapter(
  message: Derivable<IQMessageAdapter>,
  brokerUrl: Derivable<string>
): IQMqttAdapter {
  const emitter = new EventEmitter<Events>();
  const handler = getMqttHandler(emitter);
  const subscribedCustomEventTopics = new Map<number, any>();
  const getTopic = (roomId: number) => `r/${roomId}/${roomId}/e`;
  const logger = (...args: any[]) => console.log("MqttAdapter:", ...args);
  const matcher = match({
    [when(reNewMessage)]: (topic: string) => handler.newMessage(topic),
    [when(reNotification)]: (topic: string) =>
      handler.notificationHandler(topic),
    [when(reTyping)]: (topic: string) => handler.typingHandler(topic),
    [when(reDelivery)]: (topic: string) => handler.deliveredHandler(topic),
    [when(reRead)]: (topic: string) => handler.readHandler(topic),
    [when(reOnlineStatus)]: (topic: string) => handler.onlineHandler(topic),
    [when(reChannelMessage)]: (topic: string) =>
      handler.channelMessageHandler(topic),
    [when(reCustomEvent)]: (topic: string) => handler.customEventHandler(topic),
    [when()]: (topic: string) => (message: any) =>
      logger("topic not handled", topic, message)
  });
  const mqtt: Atom<MqttClient | null> = atom(null);

  emitter.on("custom-event", (data: any) => {
    const roomId = data.roomId;
    if (subscribedCustomEventTopics.has(roomId)) {
      const callback = subscribedCustomEventTopics.get(roomId);
      callback(data.payload);
    }
  });

  return {
    get mqtt() {
      return mqtt.get();
    },
    connect(userId: string): void {
      const _mqtt = connect(
        brokerUrl.get(),
        {
          will: {
            topic: `u/${userId}/s`,
            payload: 0,
            retain: 0
          }
        }
      );
      mqtt.set(_mqtt);

      _mqtt.on("message", (topic: string, message: any) => {
        message = message.toString();
        const func = matcher(topic);
        if (func != null) func(message);
      });
      _mqtt.on("connect", () => {
        emitter.emit("mqtt::connected");
      });
      _mqtt.on("reconnect", () => {
        emitter.emit("mqtt::reconnecting");
      });
      _mqtt.on("close", () => {
        emitter.emit("mqtt::disconnected");
      });
    },
    onMqttConnected(callback: () => void): () => void {
      emitter.on("mqtt::connected", callback);
      return () => emitter.off("mqtt::connected", callback);
    },
    onMqttReconnecting(callback: () => void): Subscription {
      emitter.on("mqtt::reconnecting", callback);
      return () => emitter.off("mqtt::reconnecting", callback);
    },
    onMqttDisconnected(callback: () => void): Subscription {
      emitter.on("mqtt::disconnected", callback);
      return () => emitter.off("mqtt::disconnected", callback);
    },
    onMessageDeleted(callback: (data: any) => void): () => void {
      emitter.on("message::deleted", callback);
      return () => emitter.off("message::deleted", callback);
    },
    onMessageDelivered(callback: (data: any) => void): () => void {
      emitter.on("message::delivered", callback);
      return () => emitter.off("message::delivered", callback);
    },
    onMessageRead(
      callback: (
        roomId: number,
        userId: string,
        messageId: number,
        messageUniqueId: string
      ) => void
    ): () => void {
      const handler = (data: MqttMessageDelivery) => {
        callback(
          data.roomId,
          data.userId,
          data.messageId,
          data.messageUniqueId
        );
      };
      emitter.on("message::read", handler);
      return () => emitter.off("message::read", handler);
    },
    onNewChannelMessage(callback: (data: any) => void): () => void {
      emitter.on("channel-message::new", callback);
      return () => emitter.off("channel-message::new", callback);
    },
    onNewMessage(callback: (data: IQMessage) => void): () => void {
      const handler = (data: MqttMessageReceived) => {
        callback(QMessage.fromJson(data.message));
      };
      emitter.on("message::received", handler);
      return () => emitter.off("message::received", handler);
    },
    onRoomDeleted(callback: (data: number) => void): () => void {
      emitter.on("room::cleared", callback);
      return () => emitter.off("room::cleared", callback);
    },
    onUserPresence(
      callback: (userId: string, isOnline: boolean, lastSeen: Date) => void
    ): () => void {
      const handler = (data: MqttUserPresence) => {
        callback(data.userId, data.isOnline, data.lastSeen);
      };
      emitter.on("user::presence", handler);
      return () => emitter.off("user::presence", handler);
    },
    onUserTyping(
      callback: (userId: string, roomId: number, isTyping: boolean) => void
    ): () => void {
      const handler = (data: MqttUserTyping) => {
        callback(data.userId, data.roomId, data.isTyping);
      };
      emitter.on("user::typing", handler);
      return () => emitter.off("user::typing", handler);
    },
    publishCustomEvent(roomId: number, userId: string, data: any): void {
      const payload = JSON.stringify({
        sender: userId,
        data: data
      });
      mqtt.get().publish(getTopic(roomId), payload);
    },
    subscribeCustomEvent(roomId: number, callback: Callback<any>): void {
      const topic = getTopic(roomId);
      if (subscribedCustomEventTopics.has(roomId)) return;

      mqtt.get().subscribe(topic);
      subscribedCustomEventTopics.set(roomId, callback);
    },
    unsubscribeCustomEvent(roomId: number): void {
      const topic = getTopic(roomId);
      if (!subscribedCustomEventTopics.has(roomId)) return;

      mqtt.get().unsubscribe(topic);
      subscribedCustomEventTopics.delete(roomId);
    },
    sendPresence(userId: string, isOnline: boolean): void {
      const status = isOnline ? "1" : "0";
      mqtt.get().publish(`u/${userId}/s`, status, {
        retain: true
      } as IClientPublishOptions);
    },
    sendTyping(roomId: number, userId: string, isTyping: boolean): void {
      const payload = isTyping ? "1" : "0";
      mqtt.get().publish(`r/${roomId}/${roomId}/${userId}/t`, payload);
    },
    subscribeUser(userToken: string): Subscription {
      mqtt
        .get()
        .subscribe(`${userToken}/c`)
        .subscribe(`${userToken}/n`);
      return () =>
        mqtt
          .get()
          .unsubscribe(`${userToken}/c`)
          .unsubscribe(`${userToken}/n`);
    },
    subscribeUserPresence(userId: string): void {
      mqtt.get().subscribe(`u/${userId}/s`);
    },
    unsubscribeUserPresence(userId: string): void {
      mqtt.get().unsubscribe(`u/${userId}/s`);
    },
    subscribeRoom(roomId: number): void {
      mqtt
        .get()
        .subscribe(`r/${roomId}/${roomId}/+/t`)
        .subscribe(`r/${roomId}/${roomId}/+/d`)
        .subscribe(`r/${roomId}/${roomId}/+/r`);
    },
    unsubscribeRoom(roomId: number): void {
      mqtt
        .get()
        .unsubscribe(`r/${roomId}/${roomId}/+/t`)
        .unsubscribe(`r/${roomId}/${roomId}/+/d`)
        .unsubscribe(`r/${roomId}/${roomId}/+/r`);
    },
    subscribeChannel(appId: string, channelUniqueId: string): void {
      mqtt.get().subscribe(`${appId}/${channelUniqueId}/c`);
    },
    unsubscribeChannel(appId: string, channelUniqueId: string): void {
      mqtt.get().unsubscribe(`${appId}/${channelUniqueId}/c`);
    }
  };
}
