import { atom, Derivable } from "derivable";

export type ILogger = {
  isEnabled: Derivable<boolean>;
  setEnable(enable: boolean): void;
  log(...args: any[]): void;
};
export function getLogger(): ILogger {
  const enabled = atom<boolean>(false);
  const log = enabled.derive(isEnabled =>
    isEnabled
      ? (...args: any[]) => console.log("QiscusSDK:", ...args)
      : () => {}
  );
  return {
    isEnabled: enabled.derive(it => it),
    setEnable: enable => enabled.set(enable),
    log: log.get()
  };
}
