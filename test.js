const Qiscus = require('./lib/main');

const qiscus = new Qiscus('sdksample');
qiscus.setUser('guest-101', 'passkey', async (error, user) => {
  if (error) {
    return console.dir(await error.response.json());
  }

  console.log('success login', user);
});
