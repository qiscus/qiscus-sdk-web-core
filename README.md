# Qiscus Web SDK Core

This library contains core functionalities needed to create a chat application using qiscus. 

## Installing

```
$ npm i qiscus-sdk-javascript
// or if you're using yarn
$ yarn add qiscus-sdk-javascript
```

then you need to import this library into your application.

```
import QiscusSDK from 'qiscus-sdk-javascript';

const qiscus = new QiscusSDK();
```

## Init using AppId 

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
    loginErrorCallback(data) {},
    newMessagesCallback(data) {},
    groupRoomCreatedCallback(data) {},
  },
  mode: 'widget', // widget | wide
  mqttURL: '...', // custom mqtt URL
  baseURL: '...', // custom base URL
});
```

## Init using Custom Server
```
qiscus.init({
  // change this into your own AppId through https://dashboard.qiscus.com
  AppId: 'sdksample',
  options: { },
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
let nonce, identityToken;
qiscus.getNonce().then(res => nonce = res.nonce)

// custom api call to jwt server by using nonce retrieved from previous step
api.getIdentityToken(nonce).then(res => identityToken = res.identity_token);

// verify identity token received to qiscus server
qiscus.verifyIdentityToken(identityToken).then(res => identityToken = res);
```

Use the token to authenticate
```
qiscus.setUserWithIdentityToken(identityToken);
// loginSuccessCallback | loginErrorCallback will be triggered by this point
```

## Updating a User Profile and Profile Image
Call another setUser() with new data
```
qiscus.setUser(userId, key, displayName, avatarUrl)
// this method can only be used to update displayName and avatarUrl
```

## Check is User Logged In
```
qiscus.isLogin // return true or false
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

Example of sending text message:
```
qiscus.sendComment(roomId, 'my message', null, 'text', null, null);
```

Example of sending file attachment:
```
const filePayload = JSON.stringify({
    url: "https://res.cloudinary.com/qiscus/image/upload/USWiylE7Go/ios-15049438515185.png",
    caption: "Ini gambar siapa?"
});
qiscus.sendComment(roomId, 'check my image', null, 'file_attachment', filePayload, null);
```

Example of sending custom message:
```
const customPayload = JSON.stringify({
  type: 'my-awesome-profile-card',
  content: {name, phone, ...}
});
qiscus.sendComment(roomId, 'check my profile card', null, 'custom', customPayload, null);
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
options = {
  last_comment_id: 10,
  after: true/false,
  limit: 10
}

qiscus.loadComments(room_id, options = {})
  .then(res => { 
    // do something 
  }, err => { 
    // throw the error to your log of choice 
  });
```

## Load more
Use API above and pass last commend id of current room
```
options = {
  limit: 20
}

qiscus.loadMore(last_comment_id, options = {})
  .then( res => {
    console.info(res);
  }, err => {
    throw new Error(err);
  });
```

# Room
## Create 1-on-1 Chat Room
```
qiscus.chatTarget(userId) // return Promise also triggering chatRoomCreatedCallback() of init options
```

## Create Group Room
```
users = [user1, user2, user3]
options = {
  "avatar_url": "https://mybucket.com/image.jpg"
}
createGroupRoom (name, users, options)
  .then(res => {
    new Notification('Success', { body: `Room created`});
  }, err => {
    throw new Error(err);
  });
// return promise
// also triggered groupRoomCreatedCallback();
```

## Get Chat Room by Id
```
qiscus.getRoomById(id).then(res => {
  // do something, notify user, etc
}, err => {
  // log? throw err?
})
```

## Get Chat Room By Channel
```
qiscus.getOrCreateRoomByChannel(channel).then(res => {
  // do something, notify user, etc
}, err => {
  // log? throw err?
});
```

## Get Currently Selected Chat Room Participants
```
qiscus.selected.participants // return array of participants object
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
qiscus.getRoomsInfo(params).then(res => {
  // display the data in modal box?
}, err => {
  // log? throw err?
})
```

## Get Rooms List
```
qiscus.loadRoomList().then(res => {
  // populate our own rooms list?
  this.conversations = res;
}, err => {
  // log? throw err?
}); // return Promise
```

## Update Room
```
/**
* Update room
* @param {id, room_name, avatar_url, options} args 
* @param id <Int> required
* @param room_name <String> optional
* @param avatar_url <String> optional
* @param options <Object> optional
* @return Promise
*/
qiscus.updateRoom({id: 1, room_name: 'test room', avatar_url: 'http://my.url', options: {official: false}}).then(res => {
  // do something, notify user, etc
}, err => {
  // log? throw err?
})
```

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
qiscus.readComment(room_id, comment_id);
```

## Update message Status (receive)
```
qiscus.receiveComment(room_id, comment_id);
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

# Event Handler
## loginSuccessCallback
Called when login is Success
```
qiscus.init({
  AppId: ...,
  options: {
    loginSuccessCallback(response) {
      // example: chat with user when login is successful
      qiscus.chatTarget(userId);
    }
  }
});
```

## loginErrorCallback
Called when login  is unsuccessful
```
qiscus.init({
  AppId: ...,
  options: {
    loginErrorCallback(error) {
      // example: notify user there's problem
      throw new Error(error);
    }
  }
});
```

## newMessagesCallback
Called when there's new message
```
qiscus.init({
  AppId: ...,
  options: {
    newMessagesCallback(messages) {
      // example: set desktop notification for incoming comment
      //  request permission if it is disabled
      if (Notification.permission !== "granted") Notification.requestPermission();
      // create the notification if only window is not focused
      if ( document.hasFocus() )) return
      messages.forEach(message => {
        let notif = new Notification(`New message from ${message.username}`, {
          body: message.message
          icon: your-icon-url
        });
        notif.onClick = function(){
          notif.close();
          window.focus();
        }
      })
    }
  }
});

// sample messages payload
[{
  "chat_type": "single",
  "comment_before_id": 827962,
  "comment_before_id_str": "827962",
  "disable_link_preview": false,
  "email": "customer-service@email.com",
  "id": 827963,
  "id_str": "827963",
  "message": "adf;lkjadsf",
  "payload": null,
  "room_avatar": "",
  "room_id": 30418,
  "room_id_str": "30418",
  "room_name": "Customer Service",
  "timestamp": "2017-09-29T10:51:25Z",
  "topic_id": 30418,
  "topic_id_str": "30418",
  "type": "text",
  "unique_temp_id": "bq1506682285227",
  "unix_nano_timestamp": 1506682285076080000,
  "unix_timestamp": 1506682285,
  "user_avatar": {
    "avatar": {
      "url": "https://qiscuss3.s3.amazonaws.com/uploads/55c0c6ee486be6b686d52e5b9bbedbbf/2.png"
    }
  },
  "user_avatar_url": "https://qiscuss3.s3.amazonaws.com/uploads/55c0c6ee486be6b686d52e5b9bbedbbf/2.png",
  "user_id": 131324,
  "user_id_str": "131324",
  "username": "Customer Service"
}]
```

## presenceCallback
Called when our opponent's online or offline

```
qiscus.init({
  AppId: ...,
  options: {
    presenceCallback(data) {
      // doing something here
    }
  }
});
```

## typingCallback
Called when there are someone typing in the room that we subscribe
```
qiscus.init({
  AppId: ...,
  options: {
    typingCallback(data) {
      // doing something here
    }
  }
});
```


## commentDeliveredCallback
Called when our message get delivered (reach our opponent's) device
```
qiscus.init({
  AppId: ...,
  options: {
    commentDeliveredCallback(data) {
      // doing something here
    }
  }
});
```

## commentReadCallback
Called when our message being read
```
qiscus.init({
  AppId: ...,
  options: {
    commentReadCallback(data) {
      // doing something here
    }
  }
});
```
