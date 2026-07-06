/**
 * compat/to-v2.js
 *
 * Raw-API -> v2-model-input normalizers (docs/v2-on-core-v3-plan.md §3, §14).
 *
 * core-v3's RAW adapters (`getUserAdapterRaw`/`getRoomAdapterRaw`/
 * `getMessageAdapterRaw`, wired via compat/deps.js) resolve with the same raw
 * snake_case Qiscus API JSON v2's own `HttpAdapter`-backed adapters always
 * returned (see `lib/adapters/user.js`, `lib/adapters/room.js`) — core-v3
 * only decodes to `IQ*` in its `v3/` module, which the raw adapters bypass.
 *
 * So there is no IQ->raw reconstruction to do here. These functions are
 * **near-identity normalizers**: they take the raw object as-is and apply
 * only the small amount of massaging v2's *own* old adapters used to do
 * before feeding the result to `new Comment()` / `new Room()`, or returning
 * it as a plain v2 user object. Field lists were derived by reading the
 * `Comment`/`Room` constructors (`lib/Comment.js`, `lib/Room.js`) and the old
 * `lib/adapters/{room,user}.js` massaging.
 *
 * Pure functions — no `self`/state access, not wired into `QiscusSDK` yet.
 */

/**
 * Shapes a raw comment (e.g. `resp.results.comment`, or a single element of
 * `resp.results.comments`) into the object `new Comment(raw)` expects.
 *
 * `Comment.js`'s constructor already tolerates both the canonical raw field
 * names and a couple of aliases on its own (`comment.username_as ||
 * comment.username`, `comment.username_real || comment.email`,
 * `comment.unique_temp_id || comment.unique_id`) — so most of the time this
 * is a plain passthrough. This normalizer exists as the single seam where
 * any *additional* raw-shape drift between core-v3's raw adapters and v2's
 * historical API responses would be reconciled, without touching
 * `Comment.js` itself.
 *
 * Fields `Comment.js` reads (kept as-is / aliased, never dropped):
 * `id`, `comment_before_id`, `message`, `username_as`/`username`,
 * `username_real`/`email`, `user_extras`, `timestamp`, `unique_temp_id`/
 * `unique_id`, `user_avatar_url`, `room_id`, `is_public_channel`,
 * `unix_timestamp`, `unix_nano_timestamp`, `extras`, `payload`, `status`,
 * `type`, `is_deleted`.
 *
 * @param {object} raw - a raw comment object from the Qiscus API.
 * @returns {object} an object ready for `new Comment(raw)`.
 */
export function rawCommentToV2(raw) {
  if (raw == null) return raw

  return {
    ...raw,
    // Known aliases some endpoints use interchangeably; Comment.js already
    // falls back on these pairs, but normalizing here keeps the *input*
    // self-consistent for any code that inspects it before construction.
    username_as: raw.username_as ?? raw.username,
    username_real: raw.username_real ?? raw.email,
    unique_temp_id: raw.unique_temp_id ?? raw.unique_id,
  }
}

/**
 * Shapes a raw room (e.g. `resp.results.room`) into the object
 * `new Room(raw)` expects, replicating the massaging the old
 * `roomAdapter.getOrCreateRoom` / `getOrCreateRoomByUniqueId` did
 * (`lib/adapters/room.js`) before v2 ever constructed a `Room`.
 *
 * Fields `Room.js` reads: `id`, `last_comment_id`, `last_comment_message`,
 * `last_comment_message_created_at`, `last_comment_topic_title`,
 * `room_avatar`/`avatarURL`/`avatar_url` (first non-null wins), `room_name`,
 * `room_type`/`chat_type`, `secret_code`, `participants`, `options`,
 * `last_comment`, `unread_count`, `unique_id`, `is_public_channel`,
 * `room_total_participants`, `comments`.
 *
 * @param {object} raw - a raw room object from the Qiscus API
 *   (`resp.results.room`; NOT the full response envelope).
 * @param {object} [opts]
 * @param {object[]} [opts.comments] - the sibling `resp.results.comments`
 *   array, when the endpoint returns messages alongside the room (e.g.
 *   `get_or_create_room_with_target`, `get_or_create_room_with_unique_id`).
 *   The API returns these newest-first; the old adapters reversed them
 *   before handing them to `Room` (which appends via `receiveComments` in
 *   array order) — replicated here.
 * @param {string} [opts.targetEmail] - for 1-to-1 chats (the old
 *   `getOrCreateRoom`), the other participant's email. When given, `room.name`
 *   is that participant's `username`, falling back to the LITERAL `'Room name'`
 *   when no match is found — byte-for-byte as `lib/adapters/room.js:27`
 *   (NOT `room_name`).
 * @param {boolean} [opts.useRoomName] - for the channel path (the old
 *   `getOrCreateRoomByUniqueId`), which unconditionally set
 *   `room.name = room.room_name` with no rival lookup (`lib/adapters/room.js:52`).
 *   Ignored when `opts.targetEmail` is also given (targetEmail wins).
 * @returns {object} an object ready for `new Room(raw)`.
 */
export function rawRoomToV2(raw, opts = {}) {
  if (raw == null) return raw

  const room = { ...raw }

  // Old adapters ALWAYS set `room.avatar = room.avatar_url` (unconditional
  // overwrite — `lib/adapters/room.js:24`/`:50`), so replicate exactly rather
  // than only filling when absent.
  room.avatar = room.avatar_url

  if (Array.isArray(opts.comments)) {
    room.comments = [...opts.comments].reverse()
  }

  if (opts.targetEmail && Array.isArray(room.participants)) {
    const rival = room.participants.find((p) => p.email === opts.targetEmail)
    room.name = rival ? rival.username : 'Room name'
  } else if (opts.useRoomName) {
    room.name = room.room_name
  }

  return room
}

/**
 * Shapes a raw user object (e.g. `resp.results.user`, or an element of
 * `resp.results.users`/`resp.results.blocked_users`) into the plain object
 * shape v2 methods like `getUsers`/`blockUser`/`unblockUser`/
 * `getBlockedUser` have always resolved with (`lib/adapters/user.js` returns
 * `res.body.results.user`/`.users`/`.blocked_users` completely unmassaged).
 *
 * The one known field-name wrinkle: the user-list endpoint's raw shape uses
 * `name` where the single-user endpoints (`block_user`, `my_profile`, …) use
 * `username` — normalized here so consumers can rely on `.username` either
 * way, without changing anything for endpoints that already send `username`.
 *
 * @param {object} raw - a raw user object from the Qiscus API.
 * @returns {object} a v2-shaped user object.
 */
export function rawUserToV2(raw) {
  if (raw == null) return raw

  return {
    ...raw,
    username: raw.username ?? raw.name,
  }
}

/**
 * Remaps a raw `create_room` response envelope into the summary object the old
 * `roomAdapter.createRoom` resolved with (`lib/adapters/room.js:73-88`) — NOT a
 * `new Room(...)` input. `createGroupRoom` (via `GroupChatBuilder`) resolved and
 * emitted exactly this shape, so it must be reproduced byte-for-byte.
 *
 * @param {object} raw - the raw `create_room` response envelope
 *   (`{status, results: {room, comments}}`).
 * @returns {{id, name, lastCommentId, lastCommentMessage, lastTopicId,
 *   avatarURL, options, participants: Array<{id, email, username, avatarURL}>}}
 */
export function rawCreatedRoomToV2(raw) {
  const room = raw.results.room
  return {
    id: room.id,
    name: room.room_name,
    lastCommentId: room.last_comment_id,
    lastCommentMessage: room.last_comment_message,
    lastTopicId: room.last_topic_id,
    avatarURL: room.avatar_url,
    options: room.options,
    participants: room.participants.map((participant) => ({
      id: participant.id,
      email: participant.email,
      username: participant.username,
      avatarURL: participant.avatar_url,
    })),
  }
}
