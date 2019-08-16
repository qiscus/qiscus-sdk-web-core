import { Type } from "./callbag";

const combine = (...sources: any) => (start: Type, sink: any) => {
  if (start !== 0) return;
  const n = sources.length;
  if (n === 0) {
    sink(0, () => {});
    sink(1, []);
    sink(2);
    return;
  }
  const EMPTY = {}
  let Ns = n; // start counter
  let Nd = n; // data counter
  let Ne = n; // end counter
  const vals = new Array(n);
  const sourceTalkbacks = new Array(n);
  const talkback = (t: any, d: any) => {
    if (t === 0) return;
    for (let i = 0; i < n; i++) sourceTalkbacks[i](t, d);
  };
  sources.forEach((source: any, i: number) => {
    vals[i] = EMPTY;
    source(0, (t: Type, d: any) => {
      if (t === 0) {
        sourceTalkbacks[i] = d;
        if (--Ns === 0) sink(0, talkback);
      } else if (t === 1) {
        const _Nd = !Nd ? 0 : vals[i] === EMPTY ? --Nd : Nd;
        vals[i] = d;
        if (_Nd === 0) {
          const arr = new Array(n);
          for (let j = 0; j < n; ++j) arr[j] = vals[j];
          sink(1, arr);
        }
      } else if (t === 2 && d == null) {
        if (--Ne === 0) sink(2);
      } else {
        sink(t, d);
      }
    });
  });
}
export default combine;
