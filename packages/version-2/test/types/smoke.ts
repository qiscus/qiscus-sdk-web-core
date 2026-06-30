// Compile-only smoke test for qiscus-sdk-core type declarations.
// This file is NOT a mocha test — it is excluded from the mocha glob
// 'test/**/*test.js'. Run with: pnpm run test:types

import QiscusSDK, {
  LoginResponse,
  Comment,
  Room,
} from "../../types/index";

const qiscus = new QiscusSDK();

// init
const initPromise: Promise<unknown> = qiscus.init({
  AppId: "my-app-id",
  sync: "socket",
  syncInterval: 5000,
  options: {
    loginSuccessCallback(response: LoginResponse) {
      const _email: string = response.user.email;
      void _email;
    },
    newMessagesCallback(comments: unknown[]) {
      const _first: unknown = comments[0];
      void _first;
    },
  },
});

// setUser
const setUserPromise: Promise<LoginResponse> = qiscus.setUser(
  "user@example.com",
  "secret-key",
  "Alice",
  undefined,
  { role: "admin" }
);

// sendComment
const sendCommentPromise: Promise<Comment> = qiscus.sendComment(
  12345,
  "Hello, world!",
  "unique-id-1",
  "text"
);

// loadComments
const loadCommentsPromise: Promise<object[]> = qiscus.loadComments(12345, {
  last_comment_id: 0,
  after: false,
});

// Static member shape
const _mode: {
  readonly disabled: string;
  readonly throttled: string;
  readonly enabled: string;
} = QiscusSDK.UpdateCommentStatusMode;

// Public instance state shapes
const _rooms: Room[] = qiscus.rooms;
const _selected: Room | null = qiscus.selected;
const _isLogin: boolean = qiscus.isLogin;
const _version: string = qiscus.version;

// onMessageUpdated returns an unsubscribe function
const unsubscribe: () => void = qiscus.onMessageUpdated((_msg: unknown) => {});

// upload callback shape
qiscus.upload(new File([], "test.txt"), (err, _progress, fileURL) => {
  const _err: Error | null = err;
  const _url: string | undefined = fileURL;
  void _err;
  void _url;
});

// Prevent TypeScript from complaining about unused variables
void initPromise;
void setUserPromise;
void sendCommentPromise;
void loadCommentsPromise;
void _mode;
void _rooms;
void _selected;
void _isLogin;
void _version;
void unsubscribe;
