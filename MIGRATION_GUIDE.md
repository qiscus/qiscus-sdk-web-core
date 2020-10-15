# Models / Response

All method are now using this structure for their response,

## Getting started

In version 3, we are basically rewrite and/or improve our chat sdk
so all method have unified response and/or method signature.

## User

In v3 all user related response are separated into 3 model

- `IQUser` which stand for general user model
- `IQAccount` which stand for user whom currently active user
  response of `setUser` method
- `IQParticipant` which stand for user which is part of chat room

> Note: some api might only return this data partially

```typescript
export interface IQUser {
  id: string
  name: string
  avatarUrl?: string
  extras?: Record<string, unknown>
}
export interface IQAccount extends IQUser {
  lastMessageId: number
  lastSyncEventId: string
}
export interface IQParticipant extends IQUser {
  lastMessageReadId: number
  lastMessageReceivedId: number
}
```

## Message

For all message related data, in v3 it will use the following structure.

> Note: some api might return this data partially

```typescript
export interface IQMessage {
  id: number
  uniqueId: string
  previousMessageId: IQMessage['id']
  text: string
  status: 'sending' | 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: Date
  type: 'text' | 'file_attachment' | 'custom'
  sender: IQUser
  chatRoomId: IQChatRoom['id']
  extras?: Record<string, unknown>
  payload?: Record<string, unknown>
}
```

## Chat Room

In version 3, all data that are related to chat room
will use this structure

> Note: some api might return this data partially

```typescript
export interface IQChatRoom {
  id: number
  uniqueId: string
  name: string
  type: 'single' | 'group' | 'channel'
  participants: IQParticipant[]
  totalParticipants: number
  unreadCount: number
  lastMessage?: IQMessage
  extras?: Record<string, unknown>
  avatarUrl?: string
}
```

# Method

In the version 2 all method will return
a void / null, or a promise if it need to get data from
network, but in version 3
all method that require network access will need a callback as parameter
or if you omit the callback parameter, the method will return a promise instead

## `QiscusSDK.setup` previously known as `QiscusSDK.init`

In version 2 you need to provide an object containing all
qiscus chat sdk configuration, but in version 3 initiating qiscus sdk are splited to two method

- `QiscusSDK.setup` for default configuration
- `QiscusSDK.setupWithCustomServer` for a more advanced option

```typescript
QiscusSDK.setup(
  appId: string,
  callback?: (error?: Error | undefined | null) => void
): void | Promise<void>

QiscusSDK.setupWithCustomServer(
  appId: string,
  baseUrl: string = 'https://api.qiscus.com',
  brokerUrl: string = `https://api.qiscus.com/api/v2/sdk/upload`,
  brokerLbUrl: string = 'wss://mqtt.qiscus.com:1886/mqtt',
  syncInterval: number = 5000,
  callback?: null | ((error?: Error | null | undefined) => void)
): void | Promise<void>
```

## `QiscusSDK.setUser` previously known as `QiscusSDK.setUser`

This method has almost the same signature, but different behavior.
In version 2, this method will automatically do this for you:

- Automatically mark message as received
- Periodically send user presence

In version 3, you will need to manually do that manually

```typescript
setUser(
    userId: string,
    userKey: string,
    username?: string,
    avatarUrl?: string,
    extras?: object | null,
    callback?: null | ((data?: model.IQAccount, err?: Error) => void)
  ): void | Promise<model.IQAccount>
```

## `QiscusSDK.setUserWithIdentityToken` previously known as `QiscusSDK.setUserWithIdentityToken`

This method are used where you need to set current user with JWT identity token.
In version 2, you will need to pass an object containing user data from
`QiscusSDK.verifyIdentityToken`, in version 3 that method are gone and we will do that for you,
so you only need to provide "identity token".

```typescript
setUserWithIdentityToken(
  token: string,
  callback?: IQCallback<model.IQAccount>
): void | Promise<model.IQAccount>
```

## `QiscusSDK.blockUser` previously known as `QiscusSDK.blockUser`

```typescript
blockUser(userId: string, callback?: (data?: model.IQUser, error?: Error) => void): void | Promise<model.IQUser>
```

## `QiscusSDK.unblockUser` previously known as `QiscusSDK.unblockUser`

```typescript
unblockUser(userId: string, callback?: IQCallback<model.IQUser>): void | Promise<model.IQUser>;
```

## `QiscusSDK.getBlockedUsers` previously known as `QiscusSDK.getBlockedUser`

```typescript
getBlockedUsers(page?: number, limit?: number, callback?: IQCallback<model.IQUser[]>): void | Promise<model.IQUser[]>;
```

## `QiscusSDK.clearUser` previously known as `QiscusSDK.logout`

```typescript
clearUser(callback: IQCallback<void>): void | Promise<void>;
```

## `QiscusSDK.updateUser` previously known as `QiscusSDK.updateProfile`

```typescript
updateUser(username: string, avatarUrl: string, extras?: object, callback?: IQCallback<model.IQAccount>): void | Promise<model.IQAccount>;
```

## `QiscusSDK.getUsers` previously known as `QiscusSDK.getUsers`

```typescript
getUsers(searchUsername?: string, page?: number, limit?: number, callback?: IQCallback<model.IQUser[]>): void | Promise<model.IQUser[]>;
```

## `QiscusSDK.getJWTNonce` previously known as `QiscusSDK.getNonce`

```typescript
getJWTNonce(callback?: IQCallback<string>): void | Promise<string>;
```

## `QiscusSDK.getUserData` previously known as `QiscusSDK.getUserProfile`

```typescript
getUserData(callback?: IQCallback<model.IQAccount>): void | Promise<model.IQAccount>;
```

## `QiscusSDK.registerDeviceToken` previously known as `QiscusSDK.registerDeviceToken`

```typescript
registerDeviceToken(token: string, isDevelopment: boolean, callback?: IQCallback<boolean>): void | Promise<boolean>;
```

## `QiscusSDK.removeDeviceToken` previously known as `QiscusSDK.removeDeviceToken`

```typescript
removeDeviceToken(token: string, isDevelopment: boolean, callback?: IQCallback<boolean>): void | Promise<boolean>;
```

## `QiscusSDK.updateChatRoom` previously known as `QiscusSDK.updateRoom`

```typescript
updateChatRoom(roomId: number, name?: string, avatarUrl?: string, extras?: object, callback?: IQCallback<model.IQChatRoom>): void | Promise<model.IQChatRoom>;
```

## `QiscusSDK.getChannel` no equivalent on version 2

```typescript
getChannel(uniqueId: string, callback?: IQCallback<model.IQChatRoom>): void | Promise<model.IQChatRoom>;
```

## `QiscusSDK.chatUser` previously known as `QiscusSDK.chatTarget`

```typescript
chatUser(userId: string, extras: object, callback?: IQCallback<model.IQChatRoom>): void | Promise<model.IQChatRoom>;
```

## `QiscusSDK.addParticipants` previously known as `QiscusSDK.addParticipantsToGroup`

```typescript
addParticipants(roomId: number, userIds: string[], callback?: IQCallback<model.IQParticipant[]>): void | Promise<model.IQParticipant[]>;
```

## `QiscusSDK.removeParticipants` previously known as `QiscusSDK.removeParticipantsFromGroup`

```typescript
removeParticipants(roomId: number, userIds: string[], callback?: IQCallback<model.IQParticipant[]>): void | Promise<model.IQParticipant[] | string[]>;
```

## `QiscusSDK.clearMessagesByChatRoomId` previously known as `QiscusSDK.clearRoomMessages`

```typescript
clearMessagesByChatRoomId(roomUniqueIds: string[], callback?: IQCallback<void>): void | Promise<void>;
```

## `QiscusSDK.createGroupChat` previously known as `QiscusSDK.createGroupRoom`

```typescript
createGroupChat(name: string, userIds: string[], avatarUrl: string, extras: object, callback?: IQCallback<model.IQChatRoom>): void | Promise<model.IQChatRoom>;
```

```typescript
createChannel(uniqueId: string, name: string, avatarUrl: string, extras: object, callback?: IQCallback<model.IQChatRoom>): void | Promise<model.IQChatRoom>;
getParticipants(roomUniqueId: string, page?: number, limit?: number, sorting?: 'asc' | 'desc', callback?: IQCallback<model.IQParticipant[]>): void | Promise<model.IQParticipant[]>;
getChatRooms(roomIds: number[], page?: number, showRemoved?: boolean, showParticipant?: boolean, callback?: IQCallback<model.IQChatRoom[]>): void | Promise<model.IQChatRoom[]>;
getChatRooms(uniqueIds: string[], page?: number, showRemoved?: boolean, showParticipant?: boolean, callback?: IQCallback<model.IQChatRoom[]>): void | Promise<model.IQChatRoom[]>;
getAllChatRooms(showParticipant?: boolean, showRemoved?: boolean, showEmpty?: boolean, page?: number, limit?: number, callback?: IQCallback<model.IQChatRoom[]>): void | Promise<model.IQChatRoom[]>;
getChatRoomWithMessages(roomId: number, callback?: IQCallback<model.IQChatRoom>): void | Promise<model.IQChatRoom>;
getTotalUnreadCount(callback?: IQCallback<number>): void | Promise<number>;
sendMessage(roomId: number, message: IQMessageT, callback?: IQCallback<model.IQMessage>): void | Promise<model.IQMessage>;
markAsDelivered(roomId: number, messageId: number, callback?: IQCallback<void>): void | Promise<void>;
markAsRead(roomId: number, messageId: number, callback?: IQCallback<void>): void | Promise<void>;
deleteMessages(messageUniqueIds: string[], callback?: IQCallback<model.IQMessage[]>): void | Promise<model.IQMessage[]>;
getPreviousMessagesById(roomId: number, limit?: number, messageId?: number, callback?: IQCallback<model.IQMessage[]>): void | Promise<model.IQMessage[]>;
getNextMessagesById(roomId: number, limit?: number, messageId?: number, callback?: IQCallback<model.IQMessage[]>): void | Promise<model.IQMessage[]>;
publishCustomEvent(roomId: number, data: any, callback?: Callback<void>): void;
publishOnlinePresence(isOnline: boolean, callback?: Callback<void>): void;
publishTyping(roomId: number, isTyping?: boolean): void;
subscribeCustomEvent(roomId: number, callback: IQCallback<any>): void;
unsubscribeCustomEvent(roomId: number): void;
upload(file: File, callback?: IQProgressListener): void;
hasSetupUser(callback: IQCallback<boolean>): void | Promise<boolean>;
sendFileMessage(roomId: number, message: string, file: File, callback?: IQProgressListener<model.IQMessage>): void;
getThumbnailURL(url: string): string;
setSyncInterval(interval: number): void;
synchronize(lastMessageId: model.IQAccount['lastMessageId']): void;
synchronizeEvent(lastEventId: model.IQAccount['lastSyncEventId']): void;
enableDebugMode(enable: boolean, callback: Callback<void>): void;
static Interceptor: {
    MESSAGE_BEFORE_SENT: string;
    MESSAGE_BEFORE_RECEIVED: string;
};
get Interceptor(): {
    MESSAGE_BEFORE_SENT: string;
    MESSAGE_BEFORE_RECEIVED: string;
};
intercept(interceptor: string, callback: (data: unknown) => unknown): () => void;
onMessageReceived(handler: (message: model.IQMessage) => void): () => void;
onMessageDeleted(handler: (message: model.IQMessage) => void): Subscription;
onMessageDelivered(handler: (message: model.IQMessage) => void): Subscription;
onMessageRead(handler: (message: model.IQMessage) => void): Subscription;
onUserTyping(handler: (userId: string, roomId: number, isTyping: boolean) => void): Subscription;
onUserOnlinePresence(handler: (userId: string, isOnline: boolean, lastSeen: Date) => void): Subscription;
onChatRoomCleared(handler: Callback<number>): Subscription;
onConnected(handler: () => void): Subscription;
onReconnecting(handler: () => void): Subscription;
onDisconnected(handler: () => void): Subscription;
subscribeChatRoom(room: model.IQChatRoom): void;
unsubscribeChatRoom(room: model.IQChatRoom): void;
subscribeUserOnlinePresence(userId: string): void;
unsubscribeUserOnlinePresence(userId: string): void;
```
