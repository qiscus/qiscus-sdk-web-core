## Introduction

With Qiscus Chat SDK (Software Development Kit), You can embed chat feature inside your Application quickly and easily without dealing with complexity of real-time communication infrastructure. We provide powerful API to let you quickly and seamlessly implement it into your App.

Qiscus Chat SDK provides features such as:

* 1-on-1 chat
* Group chat
* Channel chat
* Typing indicator
* Image and file attachment
* Online presence
* Delivery receipt
* Read receipt
* Delete message
* Offline message
* Block user
* Custom realtime event
* Server side integration with Server API and Webhook
* Embed bot engine in your App
* Enable Push notification
* Export and import messages from your App

### How Qiscus works

We recommend that you understand the concept before proceeding with the rest

* Messaging

The messaging flow is simple: a user register to Qiscus Server, a user open a room, send a message to a Chat Room, and then other participants will receive the message within the room. As long as user connect to Qiscus Server user will get events in event handler section [Event Handler](#event-handler), such as **on receive message, read receipt**, and so on.

* Application

To start building your application using Qiscus Chat SDK you need a key called APP ID. This APP ID acts as identifier of your Application so that Qiscus Chat SDK can connect a user to other users. You can get your APP ID [here](https://www.qiscus.com/dashboard/register). You can find your APP ID on your Qiscus application dashboard. Here you can see the picture as a reference.

[Image: ss_qiscus_chat_dashboard_app_id_docs.png]

> **Note**
*All users within the same APP ID are able to communicate with each other, across all platforms. This means users using iOS, Android, Web clients, etc. can all chat with one another. However, users in different Qiscus applications cannot talk to each other.*

* Stage (Sandbox) or Production environment

All created APP ID will be automatically recognised as a trial APP ID with certain periods of time to cease. In order to keep your APP ID active, you may want to upgrade it to a paid plan. By doing so, you can have additional APP ID as a sandbox. Once your APP ID trail is expired we may disable your APP ID from accessing Qiscus Chat SDK. Given that you can upgrade plan to continue your apps accessing Qiscus Chat SDK.


## Try Sample App

In order to help you to get to know with our chat SDK, we have provided a sample app. This sample app is built with full functionalities so that you can figure out the flow and main activities using Qiscus Chat SDK. And you can freely customize your own UI, for further detail you can download [Sample](https://bitbucket.org/qiscus/qiscus-sdk-core-web-sample) . You can also build your own app on top of our sample app


This sample use **sample APP ID**, means, you will share data with others, in case you want to try by your own you can change the APP ID into your own APP ID, you can find your APP ID in your [dashboard](https://www.qiscus.com/dashboard/login).

## ReactNative (Web)

### Requirement

Qiscus Chat SDK supports developers who want to use React Native. You can use it seamlessly without any native bridging. To do so, you need to first install the Web chat SDK. You can do that by going to your app project and type the command bellow:

`npm install --save git://github.com/qiscus/qiscus-sdk-web-core.git`

Try sample app
You can download the sample directly from our [github repository](https://github.com/qiscus/qiscus-rn-example), or if you already have Git installed, you can just clone it.

```
$ git clone https://github.com/qiscus/qiscus-rn-example
```

After cloning is completed, you will need React Native Command Line to run the sample app. In the example below, we use react-native-cli from nodejs package manager to serve Sample App locally.

```
# Install react-native-cli from npm globally
$ npm install react-native-cli -g
# Choose folder and run Web SDK Sample
$ cd qiscus-rn-example
$ npm install
$ react-native run-android
# Or run-ios if you prefer use iOS platform*
```

If you want your sample app running with your own APP ID, you can change it inside the `config.js` which is located at App`/config.js`.

### Notification

Push notification feature is not available by default, you need enable this by adding Firebase Cloud Messaging (FCM) library. You can do that by typing the command bellow:

```
$ npm install —save react-native-fcm
```

You also need to configure FCM by following this Firebase steps and react-native-fcm setup. Next step is registering logged user with the device by request in our REST API endpoint `/api/v2/mobile/set_user_device_token`. You need to get FCM token first by doing like this:

```
let tokenType = null
await FCM.getFCMToken().then(tokenFCM => {
    if (tokenFCM !== null && tokenFCM !== undefined) {
        tokenType = tokenFCM
    }
})
```
# Here is the complete example of how to put all together:
```
async successLogin (data) {
    let platform = 'rn'
    let tokenType = null
    FCM.requestPermissions({badge: false, sound: true, alert: true})

    await FCM.getFCMToken().then(tokenFCM => {
        if (tokenFCM !== null && tokenFCM !== undefined) {
            tokenType = tokenFCM
        }
    })

    axios.post(baseUri + '/api/v2/mobile/set_user_device_token', {
        token: qiscus.userData.token,
        device_token: tokenType,
        device_platform: platform
    }, { timeout: 5000 })
    .then((response) => {
        console.warn('token: ', tokenType)
    })
    .catch((error) => {
        console.log('error: ', error)
    })
}
```



> Please note you can put anywhere outside successLogin but we recommend put this configuration in the callback after login successfully.

### Notification Event

You can handle the notification events both from background and foreground. Here is how to handle the events.

```
// Foreground
FCM.on(FCMEvent.Notification, async (notif) => {
  console.log(notif)
  if (notif.opened_from_tray) {
    // if notification click from tray
  }
})

// Background
FCM.getInitialNotification().then(notif => {
  if (notif !== undefined && notif !== null) {
    console.log(notif)
  }
})
```

> Please note you still need to implement you still need to implement local notification after FCM receive the events. You should read the details in the react-native-fcm library.

## Getting Started

This section help you to start building your integration, start with send your first message.

### Step 1 : Get your APP ID

Firstly, you need to create your application in dashboard, by accessing [Qiscus Chat Dashboard](https://www.qiscus.com/dashboard/login). You can create more than one APP ID, for further information you can refer to [How Qiscus works](#introduction)

### Step 2 : Install Qiscus Chat SDK  (minimum SDK API/ Table of supported browser/ Minimum SDK IOS)

Qiscus Chat SDK requires minimum

| Browser           | Supported versions  |
|-------------------|---------------------|
| Internet Explorer | 11 or later         |
| Edge              | 17 or later         |
| Chrome            | 24 or later         |
| Firefox           | 21 or later         |
| Safari            | 11 or later         |
| Opera             | 15 or later         |
| iOS Safari        | 6 or later          |
| Android Browser   | KitKat 4.4 or later |



To integrate your app with Qiscus, you can add qiscus sdk files into your html file. Here is how to do that:

```
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
</head>
<body>

    <script src="https://unpkg.com/qiscus-sdk-core"></script>
</body>
</html>
```

Or if you are using npm as your project dependencies management you can just install our chat sdk from npm. Here is how to do that:

```
npm install --save qiscus-sdk-core
```

### Step 3 : Initialization Qiscus Chat SDK

You need to initiate your APP ID for your chat App before carry out to Authentication. This initialization only need to be done once when your app first loaded. Initialization can be implemented in the initial startup. Here is how you can do that:

```
const qiscus = new QiscusSDKCore()
window.addEventListener('DOMContentLoaded', function () {
    qiscus.init({
        AppId: 'QISCUS_SDK_APP_ID'
    })
})
```

> **Note:
**The initialization should be called once. If you are using javascript library or framework like React, Angular or Vue, it is best to initiate qiscus sdk on the top most component of your application.


### Step 4 : Authentication to Qiscus

To use Qiscus Chat SDK features a user firstly need to authenticate to Qiscus Server, for further detail you might figure out [Authentication](#authentication). This authentication is done by calling `qiscus.setUser()` function. This function will retrieve or create user credential based on the unique **User Id**, for example:

```
qiscus.setUser('userId', 'uniqueKey', 'displayName', 'https://someurl.com/avatar.png')
```

### Step 5 : Create Chat Room

There are three Chat Room types, 1-on-1, group, and channel, for further detail you can see [Chat Room Type](#chat-room-type) for this section let's use 1-on-1. We assume that you already know a targeted user you want to chat with. To start a conversation with your targeted user, it can be done with `chatTarget('userId')` method. Qiscus Chat SDK, then, will serve you a new Chat Room, asynchronously. When the room is successfully created, Qiscus Chat SDK will return a Chat Room package through `chatRoomCreatedCallback()`.

```
qiscus.chatTarget('userId')
```

> **Note**:  Make sure that your targeted user has been registered in Qiscus Chat SDK

### Step 6 : Send message

You can send any type of data through Qiscus Chat SDK, in this section let's send a “Hi” **message**,
with type value is **text**. For further detail about message you can find at [Message](#message)

```
qiscus.sendComment('roomId', 'Your message here')
```

> Note : You can define type and data freely, you can use it for custom UI purposes


You can receive the message through event handler, for example:

```
// Callback receive comment
newMessagesCallback: function (messages) {

}
```

## Authentication

To use Qiscus Chat SDK features, authentication to Qiscus Server is needed, your application needs to have user credential locally stored for further requests. The credential consists of a token that will identify a user in Qiscus Server. When you want to disconnect from Qiscus server, terminating authentication will be done by clearing the stored credential.

You need to initiate your APP ID for your chat App before carry out to Authentication. This initialization only need to be done once in the app lifecycle. Initialization can be implemented in the initial startup. Here is how you can do that:

```
qiscus.init({ AppId: 'QISCUS_SDK_APP_ID' })
```


If you have your own server **(on Premise)** you can change the URL, here's the example

```
qiscus.init({
    AppId: 'QISCUS_SDK_APP_ID',
    baseURL: 'https://your-server-url.com',
    mqttURL: 'wss://your-mqtt-broker-url.com'
})
```

For further detail on premise information you can [contact us](mailto:contact.us@qiscus.com).


> **Note**:
The initialization should be called once across a web application . The best practise you can put in window event of DOMContentLoaded or if you are using framework / library like reactjs, vuejs, or angular you can put it in the top most component of your application.


There are 2 type of authentications that you can choose to use: Client Authentication and Server Authentication

* Client Authentication can be done simply by providing userID and userKey through your client app. On the other hand, Server Authentication, the credential information is provided by your Server App. In this case, you need o prepare your own Backend.
* The Client Authentication is easier to implement but Server Authentication is more secure.

### Client Authentications

This authentication is done by calling `Qiscus.setUser()` function. This function will retrieve or create user credential based on the unique user Id. Here is example:

```
qiscus.setUser('userId', 'userKey', 'username', 'avatarURL')
```
Where:

* **userId** (string, unique): A User identifier that will be used to identify a user and used whenever another user need to chat with this user. It can be anything, whether is is user's email, your user database index, etc. HiAs long as it is unique and a string.
* **userKey** (string): userKey for authentication purpose, so even if a stranger knows your user Id, he cannot access the user data.
* **username** (string): Username for display name inside Chat Room purposes.
* **avatarURL** (string, optional): to display user's avatar, fallback to default avatar if not provided.
* **extras** (JSON, optional): to give additional information (metadata) to user, which consist key-value, for example **key: position**, and **value: engineer**.

You can learn from the figure below to understand what really happened when calling `setUser()` function:
[Image: 1511248335-Set+user.png]

> **Note**
Email addresses are a bad choice for user IDs because users may change their email address. It also unnecessarily exposes private information. We recommend to be *unique* for every user in your app, and *stable*, meaning that they can never change

### Server Authentication (JWT Token)

Server Authentication is another option, which allow you to authenticate using JSON Web Tokens [(JWT)](https://jwt.io/). JSON Web Tokens contains your app account details which typically consists of a single string which contains information of two parts, JOSE Header, JWT Claims Set.
[Image: jwt.png]
The steps to authenticate with JWT goes like this:

1. Your App request a Nonce from Qiscus Server
2. Qiscus Server send Nonce to Your App
3. Your App send user credentials and Nonce that is obtained from Qiscus Server to Your backend
4. Your backend send the token to Your App
5. Your App send that token to Qiscus Server
6. Qiscus Server send Qiscus Account to Your App


Do the following authentication tasks as described step above:

* Step 1 : Setting JOSE Header and JWT Claim Set in your backend

When your backend returns a JWT after receiving Nonce from your App, the JWT will be caught by your App and will be forwarded to Qiscus Server. In this phase, Qiscus Server will verify the JWT before returning Qiscus Account for your user. To allow Qiscus Server successfully recognize the JWT, you need to setup JOSE Header and JWT Claim Set in your backend as follow :

    * JOSE Header

```
{
  "alg": "HS256",  // must be HMAC algorithm
  "typ": "JWT", // must be JWT
  "ver": "v2" // must be v2
}
```

    * JWT Claim Set

```
{
  "iss": "QISCUS SDK APP ID", // your qiscus app id, can obtained from dashboard
  "iat": 1502985644, // current timestamp in unix
  "exp": 1502985704, // An arbitrary time in the future when this token should expire. In epoch/unix time. We encourage you to limit 2 minutes
  "nbf": 1502985644, // current timestamp in unix
  "nce": "nonce", // nonce string as Number used Once
  "prn": "YOUR APP USER ID", // your user identity, (userId), should be unique and stable
  "name": "displayname", // optional, string for user display name
  "avatar_url": "" // optional, string url of user avatar
}
```

    * Signature

JWT need to be signed using **Qiscus Secret Key**, the one you get in [dashboard](https://www.qiscus.com/dashboard/login). The signature is used to verify that the sender of the JWT is who it says it is. To create the signature part you have to take the encoded JOSE Header, the encoded JWT Claim Set, a Qiscus Secret Key, the algorithm specified in the header, and sign that.

The signature is computed using the following pseudo code :

```
HMACSHA256(
  base64UrlEncode(JOSE Header) + "." +
  base64UrlEncode(JWT Claim Set),
  Qiscus Secret Key)
```

To make this easier, we provide sample backends in PHP   [identity token implementation example](https://bitbucket.org/qiscus/qiscus-sdk-php/src/ff4f04a59100?at=master) You can use any other language or platform

* Step 2 : Start to get a **Nonce**

You need to request a Nonce from Qiscus Server. **Nonce (Number Used Once)** is a unique, randomly generated string used to identify a single request. Please be noted that a Nonce will expire in 10 minutes. So you need to implement your code to request JWT from your backend right after you got the returned Nonce. Here's the how to get a Nonce:

```
qiscus.getNonce()
```

* Step 3 : Verify the JWT

Once you get a Nonce, you can request JWT from your backend by sending Nonce you got from Qiscus Server. When you got the JWT Token, you can pass that JWT to `verifyIdentityToken()` method to allow Qiscus to authenticate your user and return Qiscus Account, as shown in the code below:

```
qiscus.getNonce()
    .then(function (nonce) {
        // Here you get identityToken from your own server
        return getIdentityTokenFromServer(resp.nonce)
    })
    .then(function (jwt) {
        // Pass jwt here
        return qiscus.verifyIdentityToken(jwt.identity_token)
    })
    .then(function (userData) {
        // Set user with user data from identity token
        qiscus.setUserWithIdentityToken(userData)
    })
```

### Clear User Data And disconnected

As mentioned in previous section, when you did `setUser()`, user's data will be stored locally. When you need to disconnect from Qiscus Server, you need to clear the user data that is related to Qiscus Chat SDK, such as token, profile, messages, rooms, etc, from local device, hence later you will not get any **message, or event**.  You can do this by calling this code:

```
qiscus.disconnect()
```

## Term of User

Qiscus Chat SDK has three user terms, Qiscus Account, Participant, and Blocked User. Qiscus Account is user who success through authentication phase, hence this user able to use Qiscus Chat SDK features. In other hand, Participant is user who in a Chat Room. At some case, you need add more user to your Chat Room, what you can do you can add participant, then your Chat Room increase the number of participant and decrease whenever you remove participant. To use add participant you can refer to this link [add participant link section](#chat-room)

Term of user table:

|Type	|Description	|
|---	|---	|
|Qiscus Account	|The user who can use Qiscus Chat SDK features that has been verified in Qiscus Server	|
|Participant	|The user who is in a Chat Room	|
|Blocked User	|The user who is blocked by another user.	|

### Blocked User

Blocked user is user who is blocked by another user. Once a user is blocked they cannot receive message from another user only in 1-on-1 Chat Room, but still get message in Channel or Group Chat Room. Blocked user do not know they are blocked, hence when send a message to a user, blocked user's message indicator stay sent receipt.


> Note :
Block user feature works only for 1-on-1 Chat Room

## Chat Room Type

### 1-on-1 chat room

Chat Room that consist of 1-on-1 chat between two users. This type of chat room allow you to have always same chat room between two users. Header of the room will be name of the pair. To create single chat, you will need to know the user Id of the opponent.

### Group chat room

When you want your many users to chat together in a single room, you need to create Group Chat Room. Basically Group Chat Room has the same concept as 1-on-1 Chat Room, but the different is that Group Chat Room will target array of user Id in a single method. The return of the function is a qiscus room object. Maximum number of participant for now is : **100** participants

### Channel

Channel is Chat Room which allow users to join without invitation. This will allow our user to implement our SDK to create Forum, Live Chat in Video Streaming, or Public Channel like in Forum or Telegram. Maximum number of participants in Channel for now : **5000** participants

### Chat Room Type Comparison Table

|Item	|1-1	|Group	|Channel	|
|---	|---	|---	|---	|
|Number of participant	|2	|100	|5000	|
|Sent Receipt	|v	|v	|-	|
|Delivered Receipt	|v	|v	|-	|
|Read Receipt	|v	|v	|-	|
|Push Notification	|v	|v	|-	|
|Unread Count	|v	|v	|v	|
|Support Chatbot interface	|v	|v	|v	|
|Block User	|v	|-	|-	|
|Adding or  Removing participant	|-	|v	|v	|

## User

This section contains user Qiscus Chat SDK behaviour, you can do **update user profile with additional metadata**, **block user**, **unblock user**, and **get list of blocked user.**

### Update user Profile with METADATA

You can update user's data, for example:

```
qiscus.updateProfile({
    name: 'updated name', // String
    avatar_url: 'new-avatar-url', // String
    extras: {} // Object
})
```

Where:

* **name**: username of its user, for display name purpose if in 1-on-1 Chat Room
* **avatar_url**: Url to display user's avatar, fallback to default avatar if not provided.
* **extras**: metadata that can be as additional information to user, which consist key-value, for example **key: position**, and **value: engineer**.

### Check is user authenticated

You can check whether user is authenticated or not, and make sure that a user allow to use Qiscus Chat SDK features.
When return **true **means user already authenticated, otherwise **false **means user not yet authenticate.

```
qiscus.isLogin // boolean
```

### Block user

You can block a user with related **user Id** parameter, this block user only works in 1-on-1 Chat Room. When a user in same Group or Channel with blocked user, a user still receive message from blocked user, for further information you can see this link [User - blocked user section](#user). You can use this function by calling this method, for example:

```
qiscus.blockUser(userId)
    .then(function (user) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

### Unblock user

You can unblock a user with related `user Id` parameter. Unblocked user can send a message again into particular Chat Room, for example:

```
qiscus.unblockUser(userId)
    .then(function (user) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

### GET blocked user LIST

You can get blocked user list with pagination, with `page`  parameter and you can set also the `limit` number of blocked users, for example:

```
qiscus.getBlockedUser(page, limit)
    .then(function (users) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

## Chat Room

This section consist Chat Room Qiscus Chat SDK behaviour In Chat Room you can add additional information called **options. options** is automatically synchronized by each participant in the conversation. It is important that the amount of data stored in **options** is kept to a minimum to ensure the quickest synchronization possible. You can use **options** tag a room for changing background colour purposes, or you can add a latitude or longitude.


> Note
options consist string key-value pairs

### Create 1-on-1 Chat Room with METADATA

The ideal creating 1-on-1 Chat Room is for use cases that require 2 users, for further information you can see this [link](#chat-room). After success creating a 1-on-1 Chat room, room name is another userId.

```
qiscus.chatTarget(userId, options)
    .then(function (room) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

Where:

* **userId**:  A User identifier that will be used to identify a user and used whenever another user need to chat with this user. It can be anything, whether is is user's email, your user database index, etc. As long as it is unique and a string.
* **options**: metadata that can be as additional information to Chat Room, which consist key-value, for example **key: background**, and **value: red**.

### Create Group Chat Room with METADATA

When you want your many users to chat together in a 1-on-1 Chat Room, you need to create Group Chat Room. Basically Group Chat Room has the same concept as 1-on-1 Chat Room, but the different is that Group Chat Room will target array of user Id in a single method.

```
qiscus.createGroupRoom(name, userIds, options)
    .then(function (room) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

Where:

* **name**: Group name
* **userIds**: List of `user Id`
* **options**:  metadata that can be as additional information to Chat Room, which consist key-value, for example **key: background**, and **value: red**.

### Create or get channel with metadata

The ideal creating Channel Chat Room is for use cases that requires a lot of number of participant. You need set `uniqueId` for identify a Channel Chat Room, If a Chat Room with predefined `unique id `is not exist then it create a new one with requester as the only one participant. Otherwise, if Chat Room with predefined unique id is already exist, it will return that room and add requester as a participant.

When first call (room is not exist), if requester did not send `avatar_ur`l and/or room `name` it will use default value. But, after the second call (room is exist) and user (requester) send `avatar_url` and/or room `name`, it will be updated to that value.

```
qiscus.getOrCreateRoomByChannel(uniqueId, name, avatarURL)
    .then(function (room) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

### Get chat room by Id (Enter existing Chat Room)

You can enter existing Chat Room by using `roomId` and creating freely your own chat UI. The return as pair of a Chat Room and List of `Comments` that you can use to init data comment for the first time as reference you can see in [sample](https://bitbucket.org/qiscus/qiscus-sdk-core-web-sample). You can use to 1-on-1 Chat Room, Group Chat room or Channel, here's how to get a Chat Room by `roomId:`

```
qiscus.getRoomById(roomId)
    .then(function (room) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

### Get Chat room opponent by *user_id*

You can get a Chat Room by `userId`. This only works 1-on-1 Chat Room.

```
qiscus.chatTarget(userId, options)
    .then(function (room) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

### Get CHAT rooms information

You can get more than one Chat Room, by passing list of `roomId`, for `uniqueIds` will deprecate soon, for now you can set same as `roomIds` . You can see participant for each room by set `showMembers` to **true**, or you can set **false** to hide participant in each room.

```
qiscus.getRoomsInfo({ room_ids, room_unique_ids, show_participants, show_removed })
    .then(function (rooms) {
        // On success
    })
    .catch(function (error) {
        // On error
    })

```

Where:

* **room_ids**: List of Chat Room id
* **room_unique_ids**: [optional] List of room unique id
* **show_participants**: [optional] whether to include room participant in the response or not
* **show_removed**: [optional] Whether to include removed message

### Get CHAT room list

Get Chat Room list is ideal case for retrieve all Chat Rooms that Qiscus Account has. Showing maximum 50 data per page.

```
qiscus.loadRoomList({ page, limit, show_participants, show_empty })
    .then(function (rooms) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

Where:

* **page**: Number of page
* **limit**: How many data you want to receive
* **show_participants**: Whether to include participant data for each rooms
* **show_empty**: Whether to include room with empty or no message inside

### Update CHAT room with metadata

You can update your Chat Room metadata, you need `roomId`, your Chat Room `name`, your Chat Room `avatar Url`, and `options`, for example:

```
qiscus.updateRoom({ id, room_name, avatar_url, options })
    .then(function (room) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

Where:

* **id**: Room id
* **room_name**: New room name
* **avatar_url**: New avatar URL
* **options**: New options

### Get Participant LIST in Chat Room

You can get participant list in Chat Room, you can get from `QiscusChatRoom`  object directly.

This example code you can retrieve from object `QiscusChatRoom`:

```
qiscusChatRoom.participants
```

### Add Participant in CHAT room

You can add more than a participant in Chat Room by calling this method `addParticipantsToGroup` you can pass multiple `userId` . Once a participant success join the Chat Room, they get new Chat Room in their Chat Room list.

```
qiscus.addParticipantsToGroup(roomId, userIds)
    .then(function (users) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

### Remove Participant in CHAT room

You can remove more than a participant in Chat Room by calling this method `removeParticipantsFromGroup `you can pass multiple `userId` . Once a participant remove from the Chat Room, they will not find related Chat Room in their Chat Room list.

```
qiscus.removeParticipantsFromGroup(roomId, userIds)
    .then(function (users) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

### Get total unread count in Chat room

You can get total unread count user have in every Chat Room, ideal this case is when you want to show badge icon, for example getting total unread count:

```
qiscus.getTotalUnreadCount()
    .then(function (unreadCount) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

## Message

This section consist of Message Qiscus Chat SDK behaviour. In Message you can add metadata called **extras**. **extras** is automatically synchronized by each participant in the Chat Room. Qiscus Chat SDK has 3 statues, Sent, Delivered, and Read for a message. Once message is sent, the OnReceiveMessage event handler will be called, you can refer to [Event Handler](#event-handler)

### Send message

You can send a **text** message or **custom** message **type**. Ideal case for **custom** message is for creating custom UI message needs by sending structured data, such as you need to **send location** message, a **ticket concert** message, a **product** info, and others UI message that need to be customized. Here is how to do that:

Sending **text** comment:

```
qiscus.sendComment(roomId, text)
    .then(function (comment) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

Sending **custom** comment type:

```
qiscus.sendComment(roomId, text, uniqueId, type, payload, extras)
    .then(function (comment) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

Where:

* **roomId**:  Chat Room Identity (Id), you can get this Id in `QiscusChatRoom` object
* **text**: message text that you send to other participant
* **uniqueId**: temporary id to identify comment data
* **type**: message type, that you can define freely, there are predefined rich messages **type**, for example: ***text, file_attachment, account_linking, buttons, button_postback_response, replay, system_event, card, custom, location, contact_person, carousel***. These type have taken, if you use it you may face your structured data will not work, these type for bot API, hence you need define other type name.
* **payload**: Payload for defining the structured message data, for example you want to create your own **file** message, you can fill the `content` using this example JSON :

```
{
  "url": "https://d1edrlpyc25xu0.cloudfront.net/sampleapp-65ghcsaysse/docs/upload/2sxErjgAfp/Android-Studio-Shortcuts-You-Need-the-Most-3.pdf",
  "caption": "",
  "file_name": "Android-Studio-Shortcuts-You-Need-the-Most.pdf"
}
```

You can find how to implement this `content` in [Sample](https://bitbucket.org/qiscus/qiscus-sdk-core-web-sample).  Another example `payload` you can craft:

```
{
  "cards": [
    {
      "header": {
        "title": "Pizza Bot Customer Support",
        "subtitle": "pizzabot@example.com",
        "imageUrl": "https://goo.gl/aeDtrS",
        "imageStyle": "IMAGE"
      },
    ...
    }
  ]
}
```

You can add **extras** before sending a message, by intercepting the object into a valid JSON string, for example:

```
"{\"key1\":\"value1\",\"key2\":\"value2\"}"
```

> Note:
Metadata is automatically synchronized by each participant in the Chat Room, it is important that the amount of data stored in metadata is kept to a minimum to ensure the quickest synchronization possible.



### Update message READ status

You can set your message status into **read**, the ideal case of this is to notify other participant that a message has **read**.
You need to pass `roomId ` and `commentId`. When you have **10 messages**, and the latest message Id, let say is **10**, once you set **read** message status with the latest message, in this case is **10**, your previous messages will update into **read** as well. You can update message read status by calling `updateCommentStatus` method, for example:

```
qiscus.updateCommentStatus(roomId, lastReadCommentId, lastReceivedCommentId)
    .then(function (comments) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

### Load message (with *limit* and *offset*)

You can get previous messages by calling `loadComments` method, by default you get 20 messages start from your `lastCommentId`, and also you can use this for load more the older messages, for example:

```
qiscus.loadComments(roomId, options)
    .then(function (comments) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

Where:

* **roomId **: ChatRoom Id
* **options**: an object with value of
    * **limit**: how many message you want to receive
    * **last_comment_id**: your starting pointer to receive message

### UPLOAD FILE

You can send a raw file by passing `file` Qiscus Chat SDK, it will automatically post a message of your file.

```
qiscus.uploadFile(roomId, file)
```

### Delete message

You can delete a message by calling this `deleteComment` method for example:

```
qiscus.deleteComment(roomId, commentUniqueIds)
    .then(function (comment) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

Where:

* **roomId**: Chat Room id
* **commentUniqueIds**:  unique id of qiscus comment object

### Clear all messages

You can clear all message by passing array of `roomId`  or `roomUniqueIds` this clear all messages only effect `QiscusAccount`  side, other participants still remain. For example:

```
qiscus.clearRoomMessages(roomIds)
    .then(function (rooms) {
        // On success
    })
    .catch(function (error) {
        // On error
    })
```

## Event Handler

Qiscus Chat SDK provides a simple way to let applications publish and listen some real time event. You can publish **typing, read, user status, custom event **and you can handle freely in event handler. This lets you inform users that another participant is actively engaged in communicating with them.

Qiscus Chat SDK is using function callback when you initialize Chat SDK. You can define it like this:

```
qiscus.init({
    AppId: 'QISCUS_SDK_APP_ID',
    options: {
        loginSuccessCallback: function (authData) {},
        loginErrorCallback: function (error) {},
        roomChangedCallback: function (data) {},
        commentDeletedCallback: function (data) {},
        commentDeliveredCallback: function (data) {},
        chatRoomCreatedCallback: function (data) {},
        groupRoomCreatedCallback: function (data) {},
        commentReadCallback: function (data) {},
        presenceCallback: function (data) {},
        typingCallback: function (data) {},
        blockUserCallback: function (data) {},
        unblockUserCallback: function (data) {},
        onReconnectCallback: function (data) {},
        newMessagesCallback: function (messages) {},
        prePostCommentCallback: function (data) {},
        commentFormatterCallback: function (data) {},
        roomChangedCallback: function (data) {},
        fileUploadedCallback: function (data) {},
        updateProfileCallback: function (data) {},
        roomClearedCallback: function (data) {}
    }
})
```

### On receive message

Messages can be received through a `newMessagesCallback` event. This event is triggered whoever sent a message.**You** can create a method that listen to this event:

```
newMessagesCallback: function (messages) {
    var message = messages[0]
    // Do something with message
}
```

> Note: **newMessagesCallback** got a parameter of array of single comment object, not an object of *comment*.

### START and STOP typing INDICATOR

You can have typing indicator by publish the typing event. You need to pass `typing` status. Set **1** to indicate the `typing` event is active, set **0** to indicate the event is inactive. The ideal of this case is you can put this to any class, for example, you need to put in Homepage, to notify that there's an active user:

```
qiscus.publishTyping(typing)
```

### Custom realtime Event

You can publish and listen any events such as when **participant is listening music**, **writing document**, and many other case that you need to tell an event to other participant in a Chat Room.

Firstly you need passing `roomId` which ChatRoom you want to set, and the structured `data` for defining what event you want to send. Example of structured `data` of **writing document** event:

```
{
  "sender": "John Doe",
  "event": "writing document...",
  **"active": "true"**
}
```

Then you can send event using this following method `publishEvent`:

```
qiscus.publishEvent(roomId, payload)
```

If you need to stop telling other participant that event is ended, you can send a flag to be **false** inside your structured data, for example:

```
{
  "sender": "John Doe",
  "event": "writing document...",
  **"active": "false"**
}
```

After sending an event, then you need to listen the event with related `roomId`,  for example:

```
qiscus.subscribeEvent(roomId, callback)
```

You need unlisten the event with related `roomId`, for example:

```
qiscus.unsubscribeEvent(roomId)
```

### ON MESSAGE STATUS CHANGE

After you listen some of events in a ChatRoom, You can receive the real time message status which defined by the event, such as **typing**, **delivered**, **read** and **custom**, for example:

```
commentDeliveredCallback: function (data) {
    // On comment delivered
},
commentSentCallback: function (data) {
    // On comment has been sent
},
commentReadCallback: function (data) {
    // On comment has been read
}
```

This is an complete version how to use Qiscus Event Handler, for example:

```
qiscus.init({
    AppId: 'QISCUS_SDK_APP_ID',
    options: {
        loginSuccessCallback: function (authData) {
            // On successfully login
        },
        loginErrorCallback: function (error) {
            // On fail on login atemp
        },
        roomChangedCallback: function (data) {
            // On room data updated
        },
        commentDeletedCallback: function (data) {
            // On comment deleted
        },
        commentDeliveredCallback: function (data) {
            // On comment delivered
        },
        chatRoomCreatedCallback: function (data) {
            // On chat room successfully created
        },
        groupRoomCreatedCallback: function (data) {
            // On group chat room successfully created
        },
        commentReadCallback: function (data) {
            // On comment has been read by user
        },
        presenceCallback: function (data) {
            // On user change it "online" status
        },
        typingCallback: function (data) {
            // On user typing
        },
        blockUserCallback: function (data) {
            // On successfully block user
        },
        unblockUserCallback: function (data) {
            // On successfully unblock user
        },
        onReconnectCallback: function (data) {
            // On Chat SDK Realtime adapter successfully reconnect to server
        },
        newMessagesCallback: function (messages) {
            // On receive a new messages
        },
        prePostCommentCallback: function (data) {
            // Before sending comment to Chat SDK server
        },
        commentFormatterCallback: function (data) {
            // A Callback to change message data before sending it to Chat SDK server
        },
        fileUploadedCallback: function (data) {
            // On file successfully uploaded
        },
        updateProfileCallback: function (data) {
            // On user successfully updated it data
        },
        roomClearedCallback: function (data) {
            // On user successfully cleared a room messages
        }
    }
})
```

Here's event handler table:

|Method	|When to call	|
|---	|---	|
|loginSuccessCallback	|When user successfully login to Chat SDK	|
|loginErrorCallback	|When user failed on login atemp	|
|roomChangedCallback	|When a room has been changed	|
|commentDeletedCallback	|When a comment has been deleted	|
|commentDeliveredCalback	|When a comment successfully delivered to a user	|
|commentReadCallback	|When a comment has been read by user	|
|chatRoomCreatedCallback	|When a room successfully created	|
|groupRoomCreatedCallback	|When a group room successfully created	|
|presenceCallback	|When user change it online status	|
|typingCallback	|When user is still typing or not	|
|blockUserCallback	|When successfully block a user	|
|unblockUserCallback	|When successfully unblock a user	|
|onReconnectCallback	|When Chat SDK realtime adapter successfully reconnected to server	|
|prePostCommentCallback	|Before sending a message to server	|
|commentFormatterCallback	|A calback to change mesage format before sending to server, and must return a modified or original message object	|
|fileUploadedCallback	|When a file has been uploaded	|
|updateProfileCallback	|When user has successfully updated profile	|
|roomClearedCallback	|When successfully cleared a room messages	|

## Push Notification (web do not have push notification, but desktop notification)

TODO EXPLAIN HOW TO IMPLEMENT DESKTOP NOTIFICATION
```
// Show a nofication when receiving new message from Qiscus Chat SDK
qiscus.init({
  AppId: 'YOUR_APP_ID',
  options: {
    // For documentation about event handler in Qiscus Chat SDK
    // you can read it here
    // http://sdk.qiscus.com/docs/web#event-handler
    // and for more information about message object
    // you can just inspect it with your prefered devtools
    // or even just doing `console.log` it.
    newMessageCallback: function (messages) {
      // Here you can setup a notification to notify your user,
      // You can use a desktop notification, or simply
      // modifying browser title
      const message = messages
      showDesktopNotification(message)
    }
  }
})

// For example showing a desktop notification for every new message
// docs: https://developer.mozilla.org/en-US/docs/Web/API/notification
function showDesktopNotification (data) {
  if (Notification.permission() !== 'granted') {
    Notification.requestPermission()
  }
  var username = data.username
  var useravatar = data.user_avatar
  var message = data.message
  var notification = new Notification('You get a new message from ' + username, {
    icon: useravatar,
    body: message
  })
}
```

## Change Log (Link to github release note)

https://github.com/qiscus/qiscus-sdk-web-core/releases

## API Reference

did not have atm

## On premise

Qiscus Chat SDK is available to be deployed on premise option. For further information you might contact  at [contact.us@qiscus.com](mailto:contact.us@qiscus.com.)

## Support

If you are facing any issue in the Qiscus Chat SDK then you can contact us and share as much information as you can.
Firstly, you can enable the **debugger** to get the logs, we recommend to use these debugger only in development environment. You can enable or disable the **debugger** setting `debugMode` property to `true` or `false`for example:

```
qiscus.debugMode = true
```

Then, you can sent the inquiries in our support platform https://support.qiscus.com/hc/en-us/requests/new with information that you have.


> Note: Enable debugger only in development environment
