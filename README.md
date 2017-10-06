# Qiscus Web SDK Core

This library contains core functionalities needed to create a chat application using qiscus. 

## Installing

```
$ npm i qiscus-sdk-core
// or if you're using yarn
$ yarn add qiscus-sdk-core
```

then you need to import this library into your application.

```
import QiscusSDK from 'qiscus-sdk-core';

const qiscus = new QiscusSDK();
```

## Initialization

```
qiscus.init({
  // change this into your own AppId through https://dashboard.qiscus.com
  AppId: 'sdksample',
  options: {
    loginSuccessCallback: function() {
      // example: start chatting with another user after successfully login
      qiscus.chatTarget('guest@qiscus.com').then(res => {
        console.info('chat with guest@qiscus.com', qiscus.selected);
      });
    }
  }
});
```

**Parameters**
- AppId {string} you can get this by creating a new App through https://dashboard.qiscus.com
- options {any} contains list of callbacks
  - loginSuccessCallback
  - loginErrorCallback
  - groupRoomCreatedCallback
  - newMessagesCallback
  - headerClickedCallback : used for header UI
  - presenceCallback : used for online presence (online / offline)

## setUser

```
qiscus.setUser(unique_id, key, username, avatar);
```

This method will create a new user based on the parameters provided if this user is not exist in the database then it will automatically log in, else it will directly log in.

**Parameters**
- unique_id {string} unique identifer of user e.g.: email, user_id, etc.
- key {string} user password
- username {string} this is the display name for the chat UI
- avatar {string} user's avatar url

## chatTarget

```
qiscus.chatTarget(unique_id)
```

This method will create a 1-1 chat room with the user identified by `unique_id` that is being provided. It will return a promise containing Room Info.

**Parameter**
- unique_id {string} identifier used by user (see setUser).

## chatGroup

```
qiscus.chatGroup(room_id)
```

This method will open a group chat room with the `id` provided in the params. It will return a promise containing Room Info.

**Parameter**
- room_id {string} Target Room id

## submitComment

```
qiscus.submitComment(roomId, message, uniqueId, type, payload)
```

This method return Promise with <Comment> object response.

**Parameters**
- roomId {int} ID of the room this message will be posted to
- message {string} message to be submitted
- uniqueId {string} (optional) Unique ID to be attached to this comment
- type {string} (optional) Type of comment, default to 'text'
- payload {string} Some comment type need payload to be submitted, need a serialized JSON Object

## createGroup

```
qiscus.createGroupRoom(room_name, unique_id)
```

This method return Promise with <Room> object response.

**Parameters**
- room_name {string} name of the room
- unique_id {array} array of users' unique_id

## Properties

### rooms

```
qiscus.rooms
```

Return a list of currently loaded `Room` object.

### selected

```
qiscus.selected
```

Return currently active `Room` object.

### userData

```
qiscus.userData
```

Return currently logged in user.
