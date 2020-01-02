
import {Storage} from '../storage'

export function getLogger(s: Storage) {
  const isEnabled = () => s.getDebugEnabled()

  return {
    get isEnabled() { return isEnabled() },
    // setEnable: enable => enabled.set(enable),
    // log: log.get()
    setEnable: (enable: boolean) => s.setDebugEnabled(enable),
    log: (...args: any[]) => {
      if (isEnabled()) console.log('QiscusSDK:', ...args)
    }

  };
}
