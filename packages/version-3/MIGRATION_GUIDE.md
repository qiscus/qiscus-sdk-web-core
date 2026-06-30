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

## `QiscusSDK.createChannel` previously known as `QiscusSDK.getOrCreateRoomWithUniqueId`

```typescript
createChannel(uniqueId: string, name: string, avatarUrl: string, extras: object, callback?: IQCallback<model.IQChatRoom>): void | Promise<model.IQChatRoom>;
```

## `QiscusSDK.getParticipants` previously known as `QiscusSDK.getParticipants`

```typescript
getParticipants(roomUniqueId: string, page?: number, limit?: number, sorting?: 'asc' | 'desc', callback?: IQCallback<model.IQParticipant[]>): void | Promise<model.IQParticipant[]>;
```

## `QiscusSDK.getChatRooms` previously known as `QiscusSDK.getRoomsInfo`

```typescript
getChatRooms(roomIds: number[], page?: number, showRemoved?: boolean, showParticipant?: boolean, callback?: IQCallback<model.IQChatRoom[]>): void | Promise<model.IQChatRoom[]>;
getChatRooms(uniqueIds: string[], page?: number, showRemoved?: boolean, showParticipant?: boolean, callback?: IQCallback<model.IQChatRoom[]>): void | Promise<model.IQChatRoom[]>;
```

## `QiscusSDK.getAllChatRooms` previously known as `QiscusSDK.loadRoomList`

```typescript
getAllChatRooms(showParticipant?: boolean, showRemoved?: boolean, showEmpty?: boolean, page?: number, limit?: number, callback?: IQCallback<model.IQChatRoom[]>): void | Promise<model.IQChatRoom[]>;
```

## `QiscusSDK.getChatRoomWithMessages` previously known as `QiscusSDK.getRoomById` or `QiscusSDK.chatGroup`

```typescript
getChatRoomWithMessages(roomId: number, callback?: IQCallback<model.IQChatRoom>): void | Promise<model.IQChatRoom>;
```

## `QiscusSDK.getTotalUnreadCount` previously known as `QiscusSDK.getTotalUnreadCount`

```typescript
getTotalUnreadCount(callback?: IQCallback<number>): void | Promise<number>;
```

## `QiscusSDK.sendMessage` previously known as `QiscusSDK.sendComment`

```typescript
sendMessage(roomId: number, message: IQMessageT, callback?: IQCallback<model.IQMessage>): void | Promise<model.IQMessage>;
```

## `QiscusSDK.sendFileMessage`

```typescript
sendFileMessage(roomId: number, message: string, file: File, callback?: IQProgressListener<model.IQMessage>): void;
```

## `QiscusSDK.markAsDelivered` previously known as `QiscusSDK.receiveComment`

```typescript
markAsDelivered(roomId: number, messageId: number, callback?: IQCallback<void>): void | Promise<void>;
```

## `QiscusSDK.markAsRead` previously known as `QiscusSDK.readComment`

```typescript
markAsRead(roomId: number, messageId: number, callback?: IQCallback<void>): void | Promise<void>;
```

## `QiscusSDK.deleteMessages` previously known as `QiscusSDK.deleteComment`

```typescript
deleteMessages(messageUniqueIds: string[], callback?: IQCallback<model.IQMessage[]>): void | Promise<model.IQMessage[]>;
```

## `QiscusSDK.getPreviousMessagesById` previously known as `QiscusSDK.loadComments` with options `after: false`

```typescript
getPreviousMessagesById(roomId: number, limit?: number, messageId?: number, callback?: IQCallback<model.IQMessage[]>): void | Promise<model.IQMessage[]>;
```

## `QiscusSDK.getNextMessagesById` previously known as `QiscusSDK.loadComments` with options `after: true`

```typescript
getNextMessagesById(roomId: number, limit?: number, messageId?: number, callback?: IQCallback<model.IQMessage[]>): void | Promise<model.IQMessage[]>;
```

## `QiscusSDK.hasSetupUser` previously known as `QiscusSDK.isLogin`

```typescript
hasSetupUser(callback: IQCallback<boolean>): void | Promise<boolean>;
```

## `QiscusSDK.upload` previously known as `QiscusSDK.upload`

```typescript
upload(file: File, callback?: (err?: Error, progress?: number, url?: string) => void): void;
```

## `QiscusSDK.getThumbnailURL` previously known as `QiscusSDK.getThumbnailURL`

```typescript
getThumbnailURL(url: string): string;
```

## `QiscusSDK.synchronize` previously known as `QiscusSDK.synchronize`

```typescript
synchronize(lastMessageId: model.IQAccount['lastMessageId']): void;
```

## `QiscusSDK.synchronizeEvent` previously known as `QiscusSDK.synchronizeEvent`

```typescript
synchronizeEvent(lastEventId: model.IQAccount['lastSyncEventId']): void;
```

```typescript
setSyncInterval(interval: number): void;
enableDebugMode(enable: boolean, callback: Callback<void>): void;
```

## `QiscusSDK.intercept` previously known as `QiscusSDK.intercept`

```typescript
intercept(interceptor: string, callback: (data: unknown) => unknown): () => void;
```

# Realtime Event

while in version 2, realtime event are passed as an arguments when initializing qiscus sdk,
in version 3, in comes with it own method, so you can initialized realtime event handling at a later code.

## `QiscusSDK.susbcribeCustomEvent`

```typescript
publishCustomEvent(roomId: number, data: any, callback?: () => void): void | Promise<void>;
subscribeCustomEvent(roomId: number, callback: IQCallback<any>): void;
unsubscribeCustomEvent(roomId: number): void;
```

## Subscribe Chat Room related events

this event include message being read and delivered, and user typing on that room

```typescript
publishOnlinePresence(isOnline: boolean, callback?: () => void): void | Promise<void>;
publishTyping(roomId: number, isTyping?: boolean, callback?: () => void): void | Promise<void>;
subscribeChatRoom(room: model.IQChatRoom): void;
unsubscribeChatRoom(room: model.IQChatRoom): void;
```

## Subscribe user online presence

```typescript
subscribeUserOnlinePresence(userId: string): void;
unsubscribeUserOnlinePresence(userId: string): void;
```

## Handler

```typescript
onMessageReceived(handler: (message: model.IQMessage) => void): () => void;
onMessageDelivered(handler: (message: model.IQMessage) => void): Subscription;
onMessageRead(handler: (message: model.IQMessage) => void): Subscription;
onUserTyping(handler: (userId: string, roomId: number, isTyping: boolean) => void): Subscription;
onUserOnlinePresence(handler: (userId: string, isOnline: boolean, lastSeen: Date) => void): Subscription;
onMessageDeleted(handler: (message: model.IQMessage) => void): Subscription;
onChatRoomCleared(handler: Callback<number>): Subscription;
```

## Subscribe realtime server connection state

this event related to connection state of mqtt, which is our realtime mechanism

```typescript
onConnected(handler: () => void): Subscription;
onReconnecting(handler: () => void): Subscription;
onDisconnected(handler: () => void): Subscription;
```

# Removed in version 3

- `QiscusSDK.selected` version 3 no longer cache / keep room data and list of comments internally
