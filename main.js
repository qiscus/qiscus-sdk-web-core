const QiscusSDK = require('./lib/index')

;(function main() {
    const qiscus = new QiscusSDK()

    qiscus.init({
      AppId: 'sdksample',
      options: {
        loginSuccessCallback: () => {
          qiscus.searchMessage({
            roomType: 'group'
          }).then((comments) => {
            console.log('comments:', comments)
          })
        }
      }
    })

    qiscus.setUser('guest-101', 'passkey')

  })()
