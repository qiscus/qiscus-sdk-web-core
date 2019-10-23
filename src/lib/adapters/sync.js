import mitt from "mitt";
import throttle from "lodash.throttle";

const noop = () => {};
const sleep = (time) => new Promise((res) => setTimeout(res, time));

class UrlBuilder {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.params = {};
  }

  param(key, value) {
    this.params[key] = value;
    return this;
  }

  build() {
    const param = Object.keys(this.params)
      .filter((it) => this.params[it] != null)
      .map((key) => `${key}=${this.params[key]}`)
      .join("&");
    return [this.baseUrl, param].join("?");
  }
}

function synchronizeFactory(
  getHttp,
  getToken,
  getInterval,
  getSync,
  getId,
  logger
) {
  const emitter = mitt();
  const synchronize = (messageId) => {
    const url = new UrlBuilder("api/v2/sdk/sync")
      .param("token", getToken())
      .param("last_received_comment_id", messageId)
      .build();

    return getHttp()
      .get(url)
      .then((resp) => {
        const results = resp.body.results;
        const messages = results.comments;
        const lastMessageId = results.meta.last_received_comment_id;
        messages.sort((a, b) => a.id - b.id);
        return Promise.resolve({
          lastMessageId,
          messages,
          interval: getInterval(),
        });
      })
      .catch(noop);
  };
  async function* generator() {
    while (true) {
      const http = getHttp();
      if (http != null && getSync()) yield synchronize(getId());
      await sleep(getInterval());
    }
  }

  return {
    get synchronize() {
      return synchronize;
    },
    get on() {
      return emitter.on;
    },
    get off() {
      return emitter.off;
    },
    async run() {
      for await (let result of generator()) {
        try {
          const messageId = result.lastMessageId;
          const messages = result.messages;
          if (messageId > getId()) {
            emitter.emit("last-message-id.new", messageId);
            messages.forEach((m) => emitter.emit("message.new", m));
          }
        } catch (e) {
          logger("error when sync", e.message);
        }
      }
    },
  };
}
function synchronizeEventFactory(
  getHttp,
  getToken,
  getInterval,
  getSync,
  getId,
  logger
) {
  const emitter = mitt();
  const synchronize = (messageId) => {
    const url = new UrlBuilder("api/v2/sdk/sync_event")
      .param("token", getToken())
      .param("start_event_id", messageId)
      .build();

    return getHttp()
      .get(url)
      .then((resp) => {
        const events = resp.body.events;
        const lastId = events
          .map((it) => it.id)
          .sort((a, b) => a - b)
          .pop();
        if (lastId != null) {
          emitter.emit("last-event-id.new", lastId);
        }
        const messageDelivered = events
          .filter((it) => it.action_topic === "delivered")
          .map((it) => it.payload.data);
        const messageRead = events
          .filter((it) => it.action_topic === "read")
          .map((it) => it.payload.data);
        const messageDeleted = events
          .filter((it) => it.action_topic === "delete_message")
          .map((it) => it.payload.data);
        const roomCleared = events
          .filter((it) => it.action_topic === "clear_room")
          .map((it) => it.payload.data);
        return Promise.resolve({
          lastId,
          messageDelivered,
          messageRead,
          messageDeleted,
          roomCleared,
          interval: getInterval(),
        });
      })
      .catch(noop);
  };
  async function* generator() {
    while (true) {
      const http = getHttp();
      if (http != null && getSync()) yield synchronize(getId());
      // if (http != null) yield synchronize(getId());
      await sleep(getInterval());
    }
  }

  return {
    get synchronize() {
      return synchronize;
    },
    get on() {
      return emitter.on;
    },
    get off() {
      return emitter.off;
    },
    async run() {
      for await (let result of generator()) {
        try {
          const eventId = result.lastId;
          if (eventId > getId()) {
            emitter.emit("last-event-id.new", eventId);
            result.messageDelivered.forEach((it) =>
              emitter.emit("message.delivered", it)
            );
            result.messageDeleted.forEach((it) =>
              emitter.emit("message.deleted", it)
            );
            result.messageRead.forEach((it) =>
              emitter.emit("message.read", it)
            );
            result.roomCleared.forEach((it) =>
              emitter.emit("room.cleared", it)
            );
          }
        } catch (e) {
          logger("error when sync event", e.message);
        }
      }
    },
  };
}

export default function SyncAdapter(
  getHttpAdapter,
  { getToken, isDebug = false, interval = 5000, getShouldSync = noop }
) {
  const emitter = mitt();
  const logger = (...args) => (isDebug ? console.log("QSync:", ...args) : {});

  let lastMessageId = 0;
  let lastEventId = 0;

  const getInterval = () => {
    if (getShouldSync()) return interval;
    return 30000;
  };
  const syncFactory = synchronizeFactory(
    getHttpAdapter,
    getToken,
    getInterval,
    getShouldSync,
    () => lastMessageId,
    logger
  );
  syncFactory.on("last-message-id.new", (id) => (lastMessageId = id));
  syncFactory.on("message.new", (m) => emitter.emit("message.new", m));
  syncFactory.run().catch((err) => console.log("got error when sync", err));

  const syncEventFactory = synchronizeEventFactory(
    getHttpAdapter,
    getToken,
    getInterval,
    getShouldSync,
    () => lastEventId,
    logger
  );
  syncEventFactory.on("last-event-id.new", (id) => (lastEventId = id));
  syncEventFactory.on("message.read", (it) => emitter.emit("message.read", it));
  syncEventFactory.on("message.delivered", (it) =>
    emitter.emit("message.delivered", it)
  );
  syncEventFactory.on("message.deleted", (it) =>
    emitter.emit("message.deleted", it)
  );
  syncEventFactory.on("room.cleared", (it) => emitter.emit("room.cleared", it));
  syncEventFactory
    .run()
    .catch((err) => console.log("got error when sync event", err));

  return {
    get on() {
      return emitter.on;
    },
    get off() {
      return emitter.off;
    },
    get synchronize() {
      return syncFactory.synchronize;
    },
    get synchronizeEvent() {
      return syncEventFactory.synchronize;
    },
  };
}
