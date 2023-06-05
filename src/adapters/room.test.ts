import { beforeAll, afterAll, beforeEach, test, expect } from 'vitest'
import { Storage } from '../storage'
import { ApiRequester, makeApiRequest } from '../api'
import { RoomAdapter, getRoomAdapter } from './room'
import { handlers } from '../mocks/handlers'
import { setupServer } from 'msw/node'
import { getMockedStorage } from '../utils/test-utils'

let s: Storage
let api: ApiRequester
let t: RoomAdapter
let server = setupServer(...handlers)

beforeEach(() => {
  s = getMockedStorage()
  api = makeApiRequest(s)
  t = getRoomAdapter(s, api)
  server.resetHandlers()
})

beforeAll(() => server.listen())
afterAll(() => server.close())

test('chatUser', async () => {
  let r = await t.chatUser('user-id')
  expect(r).toMatchInlineSnapshot(`
    {
      "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/sdksample/image/upload/w3GEHrHAtc/test.png",
      "extras": {},
      "id": 131281282,
      "lastMessage": undefined,
      "name": "guest 1001",
      "participants": [
        {
          "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/sdksample/image/upload/w3GEHrHAtc/test.png",
          "extras": {
            "key": "value",
          },
          "id": "guest-1001",
          "lastMessageReadId": 0,
          "lastMessageReceivedId": 0,
          "name": "guest 1001",
        },
        {
          "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
          "extras": {},
          "id": "guest-10122",
          "lastMessageReadId": 0,
          "lastMessageReceivedId": 0,
          "name": "guest-10122",
        },
      ],
      "totalParticipants": 2,
      "type": "single",
      "uniqueId": "41243b55577cf86527210d9f7e55f18a",
      "unreadCount": 0,
    }
  `)
})

test('addParticipants', async () => {
  let r = await t.addParticipants(1, ['guest-101'])
  expect(r).toMatchInlineSnapshot(`
    [
      {
        "avatarUrl": "https://robohash.org/DEMO2/bgset_bg2/3.14160?set=set4",
        "extras": {},
        "id": "guest-102",
        "lastMessageReadId": 0,
        "lastMessageReceivedId": 0,
        "name": "guest-102",
      },
    ]
  `)
})

test('removeParticipants', async () => {
  let r = await t.removeParticipants(1, ['guest-101'])
  expect(r).toMatchInlineSnapshot(`
    [
      {
        "avatarUrl": undefined,
        "extras": undefined,
        "id": "guest-102",
        "lastMessageReadId": undefined,
        "lastMessageReceivedId": undefined,
        "name": undefined,
      },
    ]
  `)
})

test('createGroup', async () => {
  let r = await t.createGroup('name-1', ['guest-101'])
  expect(r).toMatchInlineSnapshot(`
    {
      "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/E2nVru1t25/1507541900-avatar.png",
      "extras": {},
      "id": 131283601,
      "lastMessage": undefined,
      "name": "hi",
      "participants": [
        {
          "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
          "extras": {},
          "id": "guest-10122",
          "lastMessageReadId": 0,
          "lastMessageReceivedId": 0,
          "name": "guest-10122",
        },
        {
          "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSnp8GwSBuKHN7hy2zhbOQ4jSisSVJ_3G4BJA&usqp=CAU",
          "extras": {
            "role": "CUSTOMER",
          },
          "id": "guest-101",
          "lastMessageReadId": 0,
          "lastMessageReceivedId": 0,
          "name": "guest-101",
        },
      ],
      "totalParticipants": 2,
      "type": "group",
      "uniqueId": "fffc36bb-3355-4306-8b12-bfa0ef48281f",
      "unreadCount": 0,
    }
  `)
})

test('clearRoom', async () => {
  let r = await t.clearRoom(['unique-id'])
  expect(r).toMatchInlineSnapshot('undefined')
})

test('getChannel', async () => {
  let r = await t.getChannel('unique-id')
  expect(r).toMatchInlineSnapshot(`
    {
      "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/E2nVru1t25/1507541900-avatar.png",
      "extras": {},
      "id": 131288073,
      "lastMessage": undefined,
      "name": "guer",
      "participants": [],
      "totalParticipants": 0,
      "type": "channel",
      "uniqueId": "guer",
      "unreadCount": 0,
    }
  `)
})

test('getParticipantList', async () => {
  let r = await t.getParticipantList('unique-id')
  expect(r).toMatchInlineSnapshot(`
    [
      {
        "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
        "extras": {},
        "id": "guest-10122",
        "lastMessageReadId": 0,
        "lastMessageReceivedId": 0,
        "name": "guest-10122",
      },
    ]
  `)
})

test('getRoom', async () => {
  let r = await t.getRoom(123)
  expect(r).toMatchInlineSnapshot(`
    [
      {
        "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/E2nVru1t25/1507541900-avatar.png",
        "extras": {},
        "id": 131283601,
        "lastMessage": undefined,
        "name": "hi",
        "participants": [
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10122",
            "lastMessageReadId": 0,
            "lastMessageReceivedId": 0,
            "name": "guest-10122",
          },
          {
            "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSnp8GwSBuKHN7hy2zhbOQ4jSisSVJ_3G4BJA&usqp=CAU",
            "extras": {
              "role": "CUSTOMER",
            },
            "id": "guest-101",
            "lastMessageReadId": 0,
            "lastMessageReceivedId": 0,
            "name": "guest-101",
          },
        ],
        "totalParticipants": 2,
        "type": "group",
        "uniqueId": "fffc36bb-3355-4306-8b12-bfa0ef48281f",
        "unreadCount": 0,
      },
      [],
    ]
  `)
})

test('getRoomInfo', async () => {
  let r = await t.getRoomInfo([123])
  expect(r).toMatchInlineSnapshot(`
    [
      {
        "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/E2nVru1t25/1507541900-avatar.png",
        "extras": {},
        "id": 131283601,
        "lastMessage": {
          "__roomType": "group",
          "chatRoomId": 131283601,
          "extras": {},
          "id": 0,
          "payload": {},
          "previousMessageId": 0,
          "sender": {
            "avatarUrl": undefined,
            "extras": {},
            "id": "guest-10122",
            "name": "guest-10122",
          },
          "status": "sent",
          "text": "",
          "timestamp": 2023-05-11T07:13:04.855Z,
          "type": "unknown",
          "uniqueId": "",
        },
        "name": "hi",
        "participants": [
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10122",
            "lastMessageReadId": 0,
            "lastMessageReceivedId": 0,
            "name": "guest-10122",
          },
          {
            "avatarUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSnp8GwSBuKHN7hy2zhbOQ4jSisSVJ_3G4BJA&usqp=CAU",
            "extras": {
              "role": "CUSTOMER",
            },
            "id": "guest-101",
            "lastMessageReadId": 0,
            "lastMessageReceivedId": 0,
            "name": "guest-101",
          },
        ],
        "totalParticipants": 2,
        "type": "group",
        "uniqueId": "fffc36bb-3355-4306-8b12-bfa0ef48281f",
        "unreadCount": 0,
      },
    ]
  `)
})

test('getRoomList', async () => {
  let r = await t.getRoomList()
  expect(r).toMatchInlineSnapshot(`
    [
      {
        "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
        "extras": {},
        "id": 127377138,
        "lastMessage": {
          "__roomType": "single",
          "chatRoomId": 127377138,
          "extras": {},
          "id": 1325688975,
          "payload": {},
          "previousMessageId": 0,
          "sender": {
            "avatarUrl": undefined,
            "extras": {},
            "id": "guest-10122",
            "name": "guest-10122",
          },
          "status": "sent",
          "text": "Hi",
          "timestamp": 2023-04-27T06:10:30.802Z,
          "type": "text",
          "uniqueId": "javascript-1682575830560",
        },
        "name": "",
        "participants": [
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10122",
            "lastMessageReadId": 1325688975,
            "lastMessageReceivedId": 1325688975,
            "name": "guest-10122",
          },
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10015",
            "lastMessageReadId": 0,
            "lastMessageReceivedId": 1325688975,
            "name": "",
          },
        ],
        "totalParticipants": 2,
        "type": "single",
        "uniqueId": "0bae6783f738e1622723978b4bed1300",
        "unreadCount": 0,
      },
      {
        "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
        "extras": {},
        "id": 127376441,
        "lastMessage": {
          "__roomType": "single",
          "chatRoomId": 127376441,
          "extras": {},
          "id": 1325684798,
          "payload": {},
          "previousMessageId": 0,
          "sender": {
            "avatarUrl": undefined,
            "extras": {},
            "id": "guest-10122",
            "name": "guest-10122",
          },
          "status": "sent",
          "text": "Hi",
          "timestamp": 2023-04-27T06:08:03.310Z,
          "type": "text",
          "uniqueId": "javascript-1682575683044",
        },
        "name": "",
        "participants": [
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10014",
            "lastMessageReadId": 0,
            "lastMessageReceivedId": 1325684798,
            "name": "",
          },
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10122",
            "lastMessageReadId": 1325684798,
            "lastMessageReceivedId": 1325684798,
            "name": "guest-10122",
          },
        ],
        "totalParticipants": 2,
        "type": "single",
        "uniqueId": "e1d708da9dea442d782413e921b18aa4",
        "unreadCount": 0,
      },
      {
        "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
        "extras": {},
        "id": 127374651,
        "lastMessage": {
          "__roomType": "single",
          "chatRoomId": 127374651,
          "extras": {},
          "id": 1325674410,
          "payload": {},
          "previousMessageId": 0,
          "sender": {
            "avatarUrl": undefined,
            "extras": {},
            "id": "guest-10122",
            "name": "guest-10122",
          },
          "status": "sent",
          "text": "Hi",
          "timestamp": 2023-04-27T06:02:05.899Z,
          "type": "text",
          "uniqueId": "javascript-1682575325630",
        },
        "name": "",
        "participants": [
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10011",
            "lastMessageReadId": 0,
            "lastMessageReceivedId": 1325674410,
            "name": "",
          },
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10122",
            "lastMessageReadId": 1325674410,
            "lastMessageReceivedId": 1325674410,
            "name": "guest-10122",
          },
        ],
        "totalParticipants": 2,
        "type": "single",
        "uniqueId": "10466a252463708a8dedf4bc662e231a",
        "unreadCount": 0,
      },
      {
        "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
        "extras": {},
        "id": 127374060,
        "lastMessage": {
          "__roomType": "single",
          "chatRoomId": 127374060,
          "extras": {},
          "id": 1325671863,
          "payload": {},
          "previousMessageId": 0,
          "sender": {
            "avatarUrl": undefined,
            "extras": {},
            "id": "guest-10122",
            "name": "guest-10122",
          },
          "status": "sent",
          "text": "Hi",
          "timestamp": 2023-04-27T06:00:42.534Z,
          "type": "text",
          "uniqueId": "javascript-1682575242238",
        },
        "name": "",
        "participants": [
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10013",
            "lastMessageReadId": 0,
            "lastMessageReceivedId": 1325671863,
            "name": "",
          },
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10122",
            "lastMessageReadId": 1325671863,
            "lastMessageReceivedId": 1325671863,
            "name": "guest-10122",
          },
        ],
        "totalParticipants": 2,
        "type": "single",
        "uniqueId": "12ba704bb78bb5a636f93240b3fa5154",
        "unreadCount": 0,
      },
      {
        "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
        "extras": {},
        "id": 127373091,
        "lastMessage": {
          "__roomType": "single",
          "chatRoomId": 127373091,
          "extras": {},
          "id": 1325667845,
          "payload": {},
          "previousMessageId": 1325667125,
          "sender": {
            "avatarUrl": undefined,
            "extras": {},
            "id": "guest-10122",
            "name": "guest-10122",
          },
          "status": "sent",
          "text": "testing saja ya ini wkwk",
          "timestamp": 2023-04-27T05:58:13.707Z,
          "type": "text",
          "uniqueId": "javascript-1682575093251",
        },
        "name": "",
        "participants": [
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10012",
            "lastMessageReadId": 0,
            "lastMessageReceivedId": 1325667845,
            "name": "",
          },
          {
            "avatarUrl": "https://d1edrlpyc25xu0.cloudfront.net/kiwari-prod/image/upload/75r6s_jOHa/1507541871-avatar-mine.png",
            "extras": {},
            "id": "guest-10122",
            "lastMessageReadId": 1325667845,
            "lastMessageReceivedId": 1325667845,
            "name": "guest-10122",
          },
        ],
        "totalParticipants": 2,
        "type": "single",
        "uniqueId": "8ff083aa196f3a5564bddf3726ccdb34",
        "unreadCount": 0,
      },
    ]
  `)
})

test.skip('getUnreadCount', async () => {
  let r = await t.getUnreadCount()
  expect(r).toMatchInlineSnapshot('0')
})
