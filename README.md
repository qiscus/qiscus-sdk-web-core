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
    },
    loginErrorCallback() {},
    newMessagesCallback() {},
    groupRoomCreatedCallback() {},
  },
  mode: 'widget', // widget | wide
  mqttURL: '...', // custom mqtt URL
  baseURL: '...', // custom base URL
});
```

## Authentication with `UserId` and `UserKey`
```
qiscus.setUser(userId, key, displayName, avatarURL); 
// loginSuccessCallback | loginErrorCallback will be triggered by this point
```

### Authentication with `JWT`

First we need to get nonce from the server first.
```
let nonce;
qiscus.getNonce().then(res => nonce = res);
```

Then, we need to get identity token from server, qiscus doesn't handle this thing, it's up to client how then want to handle this. After identity token is retrieved, we need to verify the identity token to qiscus server.
```
let identityToken;
qiscus.verifyIdentityToken(token).then(res => identityToken = res);
```

Use the token to authenticate
```
qiscus.setUserWithIdentityToken(identityToken);
// loginSuccessCallback | loginErrorCallback will be triggered by this point
```

## Logout

```
qiscus.logout();
```

## Send Messages
```
qiscus.sendMessage(
  roomId:<Number>, 
  message:<String>, 
  uniqueId:<String>, // optional, will be automatically generated if `null`
  type:<String>, // default to text
  payload:<String>, // JSON.stringify(payload object)
  extras:<Object>); // In case we need to attach extra data
```

Example payload of sending carousel:
```
const carouselPayload = JSON.stringify({
  cards: [{
    image:"http://url.com/gambar.jpg",
    title:"Atasan Blouse Tunik Wanita Baju Muslim Worie Longtop",
    description:"Oleh sippnshop\n96% (666 feedback)\nRp 49.000.00,-\nBUY 2 GET 1 FREE!!!",
    default_action: {
      type:"postback",
      postback_text:"Load more",
      payload:{
        url:"http://url.com/baju?id=123&track_from_chat_room=123",
        method:"get",
        payload:null
      }
    },
    buttons:[
      {
        label:"button1",
        postback_text:"Load more",
        type:"postback",
        payload:{
          url:"http://somewhere.com/button1",
          method:"get",
          payload:null
        }
      },
      {
        label:"button2",
        postback_text:"",
        type:"link",
        payload:{url:"http://somewhere.com/button2?id=123","method":"get","payload":null}
      }
    ]
  }]
});
qiscus.sendComment(roomId, 'test carousel', null, 'carousel', carouselPayload, null);
```

## Load Messages
```
qiscus.loadComments(room_id, last_comment_id = 0, timestamp, after, limit);
```

# Room
## Create Group Room
```
qiscus.createGroupRoom([participantsUserId], roomName);
// return promise
// also triggered groupRoomCreatedCallback();
```

## Get Chat Room by Id
```
qiscus.getRoomById(id)
```

## Get Chat Room By Channel
```
qiscus.getOrCreateRoomByChannel(channel);
```

## Get Currently Selected Chat Room Participants
```
qiscus.selected.participants
```

## Get Rooms Info
```
/**
  * Params consisted of
  * @param {room_ids} array of room ids
  * @param {room_unique_ids} array of of room unique ids
  * @param {show_participants} show list of participants, default true
  * @param {show_removed} show removed room, default false
  * @returns Promise
  * @memberof QiscusSDK
  */
qiscus.getRoomsInfo(params)
```

## Get Rooms List
```
qiscus.loadRoomList(); // return Promise
```

## Update Room (WIP)

# Statuses
## Publish Start Typing
```
qiscus.publishTyping(1); 
```

## Publish Stop Typing
```
qiscus.publishTyping(0)
```

## Update message Status (read)
```
qiscus.readMessage(id);
```

## Update message Status (receive)
```
qiscus.receiveMessage(id);
```

## Currently Selected Rooms
```
qiscus.selected // room info
qiscus.selected.comments // comments list
```

## Loaded Rooms
```
qiscus.rooms
```

## userData
```
qiscus.userData
```

Return currently logged in user.
